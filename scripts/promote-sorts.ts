// Применяет курируемые решения по промоушну сортов auto→validated (task-3/14).
// Решения готовит скилл promote-sorts (агент по пивоварне): чистка имён, дедуп/слияние,
// отсев не-пива, валидация уверенных. Скрипт — детерминированный применитель + провенанс.
//
//   bun run scripts/promote-sorts.ts data/pipeline/promotions/<file>.json
//   bun run scripts/promote-sorts.ts data/pipeline/promotions/   # все *.json в папке
//
// Формат файла решений (один или массив таких объектов):
// {
//   "brewery": "<slug>",
//   "validate": [{ "slug": "<тек. slug сорта>", "name": "<чистое имя>", "styleRaw": "<опц.>", "abv": <опц.> }],
//   "merge":    [{ "from": "<slug-дубля>", "into": "<slug-канона>" }],
//   "drop":     ["<slug>", ...],                 // не пиво / мусор → удалить сорт (листинги → beer_id=null)
//   "review":   [{ "slug": "<slug>", "reason": "<почему спорно>" }]  // → overrides.json needs-review
// }
import { openDb, stats } from "@beer-log/store";
import { categorizeStyle, slugify } from "@beer-log/catalog-core";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const OVERRIDES = "data/pipeline/overrides.json";
const arg = process.argv[2];
if (!arg) { console.error("укажи файл/папку решений"); process.exit(1); }

type Decision = {
  brewery: string;
  validate?: { slug: string; name?: string; styleRaw?: string; abv?: number }[];
  merge?: { from: string; into: string }[];
  drop?: string[];
  review?: { slug: string; reason: string }[];
};

// собрать список файлов решений
const files: string[] = [];
if (arg.endsWith(".json")) files.push(arg);
else for await (const e of new Bun.Glob("*.json").scan({ cwd: arg, absolute: true })) files.push(e);

const db = openDb(DB_PATH);
const beerBy = (brewId: string, slug: string) =>
  db.query("SELECT id, name, slug, aliases, status FROM beers WHERE brewery_id = ? AND slug = ?").get(brewId, slug) as
    { id: string; name: string; slug: string; aliases: string; status: string } | null;

let nValidated = 0, nMerged = 0, nDropped = 0, nReview = 0;
const reviewLedger: Record<string, { reason: string; at: string }[]> = {};
const today = new Date().toISOString().slice(0, 10);

for (const f of files) {
  const raw = JSON.parse(await Bun.file(f).text());
  const decisions: Decision[] = Array.isArray(raw) ? raw : [raw];
  for (const d of decisions) {
    const brew = db.query("SELECT id, name FROM breweries WHERE slug = ?").get(d.brewery) as { id: string; name: string } | null;
    if (!brew) { console.log(`! пивоварня ${d.brewery} не найдена — пропуск`); continue; }

    // merge: листинги дубля → канон, имя дубля → алиас канона, удалить дубль
    for (const m of d.merge ?? []) {
      const from = beerBy(brew.id, m.from), into = beerBy(brew.id, m.into);
      if (!from || !into) { console.log(`  merge ${d.brewery}: ${m.from}→${m.into} — нет одного из сортов`); continue; }
      db.query("UPDATE price_listings SET beer_id = ? WHERE beer_id = ?").run(into.id, from.id);
      db.query("UPDATE beer_sources SET beer_id = ? WHERE beer_id = ?").run(into.id, from.id);
      const al = new Set<string>(JSON.parse(into.aliases || "[]")); al.add(from.name);
      db.query("UPDATE beers SET aliases = ? WHERE id = ?").run(JSON.stringify([...al]), into.id);
      db.query("DELETE FROM beers WHERE id = ?").run(from.id);
      nMerged++;
    }
    // drop: удалить сорт, листинги осиротить (остаются demand-данными)
    for (const slug of d.drop ?? []) {
      const b = beerBy(brew.id, slug);
      if (!b) continue;
      db.query("UPDATE price_listings SET beer_id = NULL WHERE beer_id = ?").run(b.id);
      db.query("DELETE FROM beer_sources WHERE beer_id = ?").run(b.id);
      db.query("DELETE FROM beers WHERE id = ?").run(b.id);
      nDropped++;
    }
    // validate: чистое имя + стиль (если задан/выводим) + status=validated. slug НЕ меняем
    // (стабильный ключ для снапшотов/листингов); правим только отображаемое имя.
    for (const v of d.validate ?? []) {
      const b = beerBy(brew.id, v.slug);
      if (!b) { console.log(`  validate ${d.brewery}/${v.slug} — нет сорта`); continue; }
      const name = v.name ?? b.name;
      let st: { slug: string; name: string; category: string } | null = null;
      if (v.styleRaw) { const c = categorizeStyle(v.styleRaw); st = { slug: c.slug, name: v.styleRaw, category: c.category }; }
      db.query(
        `UPDATE beers SET name = ?, status = 'validated',
           style_slug = COALESCE(?, style_slug), style_name = COALESCE(?, style_name),
           style_category = COALESCE(?, style_category), abv = COALESCE(?, abv), updated_at = ?
         WHERE id = ?`,
      ).run(name, st?.slug ?? null, st?.name ?? null, st?.category ?? null, v.abv ?? null, today, b.id);
      nValidated++;
    }
    // review: спорные → overrides needs-review (человеку)
    for (const r of d.review ?? []) {
      (reviewLedger[d.brewery] ??= []).push({ reason: r.reason, at: today });
      nReview++;
    }
  }
}

// дописать спорные в overrides.json (needs-review по пивоварне/сорту)
if (Object.keys(reviewLedger).length) {
  const ov = (await Bun.file(OVERRIDES).exists())
    ? JSON.parse(await Bun.file(OVERRIDES).text()) : { breweries: {}, shops: {}, cities: {} };
  ov.breweries ??= {};
  for (const [slug, items] of Object.entries(reviewLedger)) {
    ov.breweries[slug] ??= {};
    ov.breweries[slug].needsReview = [...(ov.breweries[slug].needsReview ?? []), ...items];
  }
  await Bun.write(OVERRIDES, JSON.stringify(ov, null, 2));
}

console.log(`promote: validated ${nValidated} | merged ${nMerged} | dropped ${nDropped} | review ${nReview}`);
console.log("STATS:", JSON.stringify(stats(db)));
db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
db.close();
