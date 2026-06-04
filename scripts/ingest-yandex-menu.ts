// Второй источник КРАНА точки: меню Яндекс.Карт (RocketData). Дополняет taplink-кран по
// НАЛИЧИЮ (что налито) и обогащает ABV/стилем — но НЕ по цене: объём подачи в меню не указан,
// поэтому цены несопоставимы с taplink (тот за 1 л). Пишет листинги format=draft,
// source_type=map-menu, volume_ml=null, и печатает кросс-валидацию ассортимента taplink↔Яндекс.
//
//   DRY=1 bun run scripts/ingest-yandex-menu.ts data/discovery/raw-yandex-beermug-gagarina-118.txt beermug-nn/gagarina-118
//   bun run scripts/ingest-yandex-menu.ts <raw.txt> <seller> [observedAt]
import { openDb, recordListing, stats } from "@beer-log/store";
import { buildMatcher } from "./lib/catalog-matcher.ts";
import { tier } from "./lib/provenance.ts";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const DRY = !!process.env.DRY;
const today = new Date().toISOString().slice(0, 10);

const file = process.argv[2];
const seller = process.argv[3];
const observedAt = process.argv[4] || today;
if (!file || !seller) {
  console.error("usage: ingest-yandex-menu.ts <raw.txt> <seller> [observedAt]");
  process.exit(1);
}

const text = await Bun.file(file).text();
const rows = text.split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"))
  .map((l) => l.split("|").map((c) => c.trim()))
  .filter((c) => c.length >= 2)
  .map(([name, descr, priceStr]) => ({
    name: name ?? "", descr: descr ?? "",
    title: `${name} ${descr}`.replace(/\s+/g, " ").trim(),
    price: priceStr ? parseInt(priceStr, 10) : undefined,
  }));

const db = openDb(DB_PATH);
const matcher = buildMatcher(db, { createAuto: !DRY });
const ft = tier({ sourceType: "map-menu", observedAt });
console.log(`=== Яндекс-меню (кран) ${seller} · ${file} · DRY=${DRY} ===`);
console.log(`позиций в меню: ${rows.length} · провенанс: map-menu · ${observedAt} · tier=${ft.level} «${ft.label}»\n`);

const yandexBeerIds = new Set<string>();
let matched = 0, brewOnly = 0, unmatched = 0, listings = 0;
const unmatchedSample: string[] = [];

for (const r of rows) {
  const m = matcher.match(r.title);
  if (m.beerId) { matched++; yandexBeerIds.add(m.beerId); }
  else if (m.breweryId) brewOnly++;
  else { unmatched++; if (unmatchedSample.length < 15) unmatchedSample.push(`  ${r.title.slice(0, 56)}`); }

  if (!DRY) {
    const extId = r.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60);
    recordListing(db, {
      id: `ymenu-${seller.split("/").pop()}-${extId}-${observedAt}`,
      beerId: m.beerId, beerSlug: m.beerSlug, beerNameRaw: r.title,
      price: r.price, currency: r.price != null ? "RUB" : undefined,
      volumeMl: undefined, // объём подачи в меню не указан — не сопоставлять по цене
      format: "draft", seller, sourceUrl: `yandex-maps-menu:${observedAt}`,
      seenAt: observedAt, sourceType: "map-menu",
    });
    listings++;
  }
}

console.log(`матч: сорт ${matched} · только пивоварня ${brewOnly} · не узнано ${unmatched} (${((matched / rows.length) * 100).toFixed(0)}% сорта)`);
if (unmatchedSample.length) { console.log(`\n— НЕ узнано:`); unmatchedSample.forEach((s) => console.log(s)); }

// ── кросс-валидация ПО НАЛИЧИЮ (не по цене): taplink-кран ↔ Яндекс-меню ──────────
const taplinkRows = db.query(
  "SELECT DISTINCT beer_id AS id FROM price_listings WHERE seller = ? AND source_url LIKE 'https://taplink%' AND beer_id IS NOT NULL",
).all(seller) as { id: string }[];
const taplinkIds = new Set(taplinkRows.map((r) => r.id));

const both = [...yandexBeerIds].filter((id) => taplinkIds.has(id));
const onlyYandex = [...yandexBeerIds].filter((id) => !taplinkIds.has(id));
const onlyTaplink = [...taplinkIds].filter((id) => !yandexBeerIds.has(id));
const nameOf = (id: string) => (db.query("SELECT name FROM beers WHERE id = ?").get(id) as { name: string } | null)?.name ?? id;

console.log(`\n— Кросс-валидация наличия (taplink ↔ Яндекс), по сматченным сортам:`);
console.log(`  оба источника: ${both.length} · только Яндекс: ${onlyYandex.length} · только taplink: ${onlyTaplink.length}`);
const agree = both.length / (both.length + onlyYandex.length + onlyTaplink.length || 1);
console.log(`  согласованность ассортимента: ${(agree * 100).toFixed(0)}%`);
if (onlyTaplink.length) { console.log(`  · есть в taplink, нет в Яндексе (возможно сошло с крана):`); onlyTaplink.slice(0, 10).forEach((id) => console.log(`      ${nameOf(id)}`)); }
if (onlyYandex.length) { console.log(`  · есть в Яндексе, нет в taplink (новое/добор):`); onlyYandex.slice(0, 10).forEach((id) => console.log(`      ${nameOf(id)}`)); }

if (!DRY) {
  console.log(`\nзаписано листингов: ${listings} (format=draft, source_type=map-menu, seller=${seller})`);
  console.log("STATS:", JSON.stringify(stats(db)));
  db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
}
db.close();
