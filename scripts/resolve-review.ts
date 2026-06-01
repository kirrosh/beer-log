// Применитель решений человека по гейту human-review (интерактивный разбор).
// Вход: JSON-файл раунда — массив { brewery, validate?, merge?, drop? } (формат как у promote-sorts).
//   bun run scripts/resolve-review.ts data/pipeline/review-rounds/<round>.json
// Делает:
//   1) applies validate/merge/drop к БД (та же семантика, что promote-sorts.ts);
//   2) убирает решённые slug'и из review-массива в data/pipeline/promotions/<brewery>.json;
//   3) ПЕРЕСОБИРАЕТ overrides.needsReview по каждой пивоварне из promotions/*.json review
//      (reason-only, дедуп по reason) — чистит сталь/дубли, оставляет только нерешённое.
import { openDb, stats } from "@beer-log/store";
import { categorizeStyle } from "@beer-log/catalog-core";
import fs from "fs";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const OVERRIDES = "data/pipeline/overrides.json";
const PROMO = "data/pipeline/promotions";
const arg = process.argv[2];
if (!arg) { console.error("укажи файл решений раунда"); process.exit(1); }

type Dec = {
  brewery: string;
  validate?: { slug: string; name?: string; styleRaw?: string; abv?: number }[];
  merge?: { from: string; into: string }[];
  drop?: string[];
};

const db = openDb(DB_PATH);
const today = new Date().toISOString().slice(0, 10);
const beerBy = (brewId: string, slug: string) =>
  db.query("SELECT id, name, aliases FROM beers WHERE brewery_id = ? AND slug = ?").get(brewId, slug) as
    { id: string; name: string; aliases: string } | null;

const decisions: Dec[] = JSON.parse(fs.readFileSync(arg, "utf8"));
let nV = 0, nM = 0, nD = 0;
const resolvedBySlug: Record<string, Set<string>> = {}; // brewery -> resolved slugs

for (const d of decisions) {
  const brew = db.query("SELECT id FROM breweries WHERE slug = ?").get(d.brewery) as { id: string } | null;
  if (!brew) { console.log(`! ${d.brewery} не найдена`); continue; }
  const resolved = (resolvedBySlug[d.brewery] ??= new Set());

  for (const m of d.merge ?? []) {
    const from = beerBy(brew.id, m.from), into = beerBy(brew.id, m.into);
    if (!from || !into) { console.log(`  merge ${d.brewery}: ${m.from}→${m.into} — нет сорта`); continue; }
    db.query("UPDATE price_listings SET beer_id = ? WHERE beer_id = ?").run(into.id, from.id);
    db.query("UPDATE beer_sources SET beer_id = ? WHERE beer_id = ?").run(into.id, from.id);
    const al = new Set<string>(JSON.parse(into.aliases || "[]")); al.add(from.name);
    db.query("UPDATE beers SET aliases = ? WHERE id = ?").run(JSON.stringify([...al]), into.id);
    db.query("DELETE FROM beers WHERE id = ?").run(from.id);
    resolved.add(m.from); nM++;
  }
  for (const slug of d.drop ?? []) {
    const b = beerBy(brew.id, slug);
    if (!b) { resolved.add(slug); continue; }
    db.query("UPDATE price_listings SET beer_id = NULL WHERE beer_id = ?").run(b.id);
    db.query("DELETE FROM beer_sources WHERE beer_id = ?").run(b.id);
    db.query("DELETE FROM beers WHERE id = ?").run(b.id);
    resolved.add(slug); nD++;
  }
  for (const v of d.validate ?? []) {
    const b = beerBy(brew.id, v.slug);
    if (!b) { console.log(`  validate ${d.brewery}/${v.slug} — нет сорта`); resolved.add(v.slug); continue; }
    let st: { slug: string; name: string; category: string } | null = null;
    if (v.styleRaw) { const c = categorizeStyle(v.styleRaw); st = { slug: c.slug, name: v.styleRaw, category: c.category }; }
    db.query(
      `UPDATE beers SET name = ?, status = 'validated',
         style_slug = COALESCE(?, style_slug), style_name = COALESCE(?, style_name),
         style_category = COALESCE(?, style_category), abv = COALESCE(?, abv), updated_at = ?
       WHERE id = ?`,
    ).run(v.name ?? b.name, st?.slug ?? null, st?.name ?? null, st?.category ?? null, v.abv ?? null, today, b.id);
    resolved.add(v.slug); nV++;
  }
}

// 2) убрать решённые slug'и из review-массивов promotions/*.json
for (const [brewery, slugs] of Object.entries(resolvedBySlug)) {
  const f = `${PROMO}/${brewery}.json`;
  if (!fs.existsSync(f)) continue;
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  if (Array.isArray(j.review)) {
    j.review = j.review.filter((r: { slug: string }) => !slugs.has(r.slug));
    fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
  }
}

// 3) пересобрать overrides.needsReview из promotions/*.json review (reason-only, дедуп по reason)
const ov = JSON.parse(fs.readFileSync(OVERRIDES, "utf8"));
ov.breweries ??= {};
for (const file of fs.readdirSync(PROMO).filter((f) => f.endsWith(".json"))) {
  const j = JSON.parse(fs.readFileSync(`${PROMO}/${file}`, "utf8"));
  const brewery = j.brewery as string;
  if (!brewery) continue;
  const entry = (ov.breweries[brewery] ??= {});
  const reviews: { slug: string; reason: string }[] = Array.isArray(j.review) ? j.review : [];
  if (reviews.length) {
    const seen = new Set<string>(); // дедуп по slug (а не reason: разные сорта могут иметь одинаковую причину)
    entry.needsReview = reviews
      .filter((r) => !seen.has(r.slug) && seen.add(r.slug))
      .map((r) => ({ slug: r.slug, reason: r.reason, at: today }));
  } else {
    delete entry.needsReview;
  }
  if (Object.keys(entry).length === 0) delete ov.breweries[brewery];
}
fs.writeFileSync(OVERRIDES, JSON.stringify(ov, null, 2) + "\n");

console.log(`resolve: validated ${nV} | merged ${nM} | dropped ${nD}`);
console.log("STATS:", JSON.stringify(stats(db)));
db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
db.close();
