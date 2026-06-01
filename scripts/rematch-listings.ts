// Ре-матч уже записанных листингов с beer_id=null против ВЫРОСШЕГО каталога (без скрейпинга).
// Старые листинги (особенно beerkontora, залитые при маленьком каноне) теперь линкуются к
// пивоварням/сортам, добавленным позже. Гоняем тот же lib/catalog-matcher по beer_name_raw,
// проставляем beer_id где уверенный матч. AUTO=1 — заодно заводить auto-сорта (как при ингесте).
//
//   SELLER=beerkontora.ru DRY=1 bun run scripts/rematch-listings.ts   # оценка: сколько добьём
//   SELLER=beerkontora.ru bun run scripts/rematch-listings.ts          # проставить (только existing-сорта)
//   SELLER=beerkontora.ru AUTO=1 bun run scripts/rematch-listings.ts   # + создавать auto-сорта
//   (без SELLER — по всем продавцам)
import { openDb, stats } from "@beer-log/store";
import { buildMatcher } from "./lib/catalog-matcher.ts";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const DRY = !!process.env.DRY;
const AUTO = !!process.env.AUTO;
const SELLER = process.env.SELLER || null;
// не-пиво: в канон НЕ заводим и не линкуем (тоники/сидр/медовуха/комбуча/газировка/квас/вода).
// Те же маркеры, что в ingest-shop-full — иначе AUTO плодит soft-drink-«сорта» (Бакунин Botanicals).
const NONBEER = /комбуч|kombucha|тоник|tonik|tonic|botanicals|ботаникалс|сидр|cider|медовух|\bmead\b|газирован|квас|kvas|лимонад|lemonade|морс|\bвода\b|\bwater\b|энергет|\benergy\b|узвар|напиток из/i;

const db = openDb(DB_PATH);
db.exec("PRAGMA busy_timeout = 15000;"); // переждать чужой короткий лок, не падать в BUSY
// createAuto только в боевом режиме (в DRY upsertBeer писал бы в БД)
const matcher = buildMatcher(db, { createAuto: AUTO && !DRY });
console.log(`матчер: ${matcher.breweryCount} пивоварен / ${matcher.aliasCount} алиасов | DRY=${DRY} AUTO=${AUTO} | seller=${SELLER ?? "ВСЕ"}`);

const rows = (SELLER
  ? db.query("SELECT id, beer_name_raw FROM price_listings WHERE beer_id IS NULL AND seller = ?").all(SELLER)
  : db.query("SELECT id, beer_name_raw FROM price_listings WHERE beer_id IS NULL").all()
) as { id: string; beer_name_raw: string }[];
console.log(`листингов без beer_id: ${rows.length}`);

const upd = db.query("UPDATE price_listings SET beer_id = ? WHERE id = ?");
let matchedExisting = 0, matchedAuto = 0, brewOnly = 0, still = 0, skippedNonBeer = 0;
const sample: string[] = [];

for (const r of rows) {
  if (NONBEER.test(r.beer_name_raw || "")) { skippedNonBeer++; continue; }
  const m = matcher.match(r.beer_name_raw || "");
  if (m.beerId) {
    if (m.createdAuto) matchedAuto++; else matchedExisting++;
    if (!DRY) upd.run(m.beerId, r.id);
    if (sample.length < 30) sample.push(`${m.createdAuto ? "+" : "="} [${m.breweryName}] ${(r.beer_name_raw || "").slice(0, 48)} → ${m.beerName}`);
  } else if (m.breweryId) {
    brewOnly++;
  } else {
    still++;
  }
}

console.log(`\nновых линков: existing-сорт ${matchedExisting}` + (AUTO ? ` | auto-сорт ${matchedAuto}` : ` | пивоварня-есть-сорт-нет ${brewOnly} (AUTO=1 завёл бы)`) + ` | осталось null ${still}` + (AUTO ? "" : ` (+ ${brewOnly} brew-only)`) + ` | пропущено не-пиво ${skippedNonBeer}`);
console.log(`\n— примеры новых линков:`);
sample.forEach((s) => console.log(s));
if (!DRY) { console.log("\nSTATS:", JSON.stringify(stats(db))); db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;"); }
db.close();
