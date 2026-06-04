// Ингест «холодильника точки» из фото полок (vision). Капча данных — НЕ веб-фетч, а
// фото от пользователя на месте: агент распознаёт банки/бутылки в JSON-кандидаты, этот
// скрипт матчит к канону и пишет листинги format=can/bottle на seller точки (venue).
// Разблокирует поиск/выбор в бутылочном пуле (сценарии A1-A4/B/C2 груминга 2026-06-04).
//
// Источник: data/discovery/shelf-<venue-slug>.json вида:
//   { "venue": "beermug-nn/gagarina-118", "sourceUrl": "shelf-photo:2026-06-04",
//     "items": [ {"brewery":"Jaws Brewery","sort":"Конфликт","abv":6.6,"style":"NEIPA",
//                 "format":"can","price":520,"volumeMl":500} , ... ] }
// Поля item: brewery+sort обязательны; abv/style/format/price/volumeMl — опц.
// format по умолчанию "can"; volumeMl — из поля или из строки; price — с ценника на фото.
//
//   DRY=1 bun run scripts/ingest-shelf.ts data/discovery/shelf-beermug-nn-gagarina-118.json
//   bun run scripts/ingest-shelf.ts data/discovery/shelf-beermug-nn-gagarina-118.json
import { openDb, recordListing, stats } from "@beer-log/store";
import { parseVolumeMl, looksLikeBeerLine, type ShopFormat } from "@beer-log/parsers";
import { buildMatcher } from "./lib/catalog-matcher.ts";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const DRY = !!process.env.DRY;
const today = new Date().toISOString().slice(0, 10);

const file = process.argv[2];
if (!file) { console.error("Укажи JSON-файл: bun run scripts/ingest-shelf.ts <shelf-*.json>"); process.exit(1); }

interface ShelfItem {
  brewery?: string; sort?: string; abv?: number; style?: string;
  format?: ShopFormat; price?: number; volumeMl?: number;
}
const raw = await Bun.file(file).json() as { venue?: string; sourceUrl?: string; items?: ShelfItem[] };
const venue = raw.venue;
if (!venue) { console.error(`! нет поля "venue" (seller точки) в ${file}`); process.exit(1); }
const sourceUrl = raw.sourceUrl ?? "shelf-photo";
const venueSlug = venue.split("/").pop()!;

const db = openDb(DB_PATH);
const matcher = buildMatcher(db, { createAuto: !DRY });
console.log(`=== Холодильник ${venue} · файл ${file} · DRY=${DRY} ===`);
console.log(`матчер: ${matcher.breweryCount} пивоварен / ${matcher.aliasCount} алиасов`);

const seen = new Set<string>();
let total = 0, matchedBeer = 0, autoCreated = 0, brewOnly = 0, unmatched = 0, listings = 0;
const sampleMatched: string[] = [], sampleUnmatched: string[] = [];

for (const it of raw.items ?? []) {
  const brewery = (it.brewery ?? "").trim();
  const sort = (it.sort ?? "").trim();
  if (!sort && !brewery) continue;
  const title = [brewery, sort].filter(Boolean).join(" ").replace(/\s+/g, " ");
  const extId = `${brewery}-${sort}`.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  if (!extId || seen.has(extId)) continue;

  const mm = matcher.match(title);
  // фото пивного холодильника — мусора нет; берём, если узнали пивоварню ИЛИ строка похожа на пиво
  if (!mm.breweryId && !looksLikeBeerLine(title)) continue;
  seen.add(extId);
  total++;
  if (mm.beerId) { matchedBeer++; if (mm.createdAuto) autoCreated++;
    if (sampleMatched.length < 25) sampleMatched.push(`${mm.createdAuto ? "+" : "="} [${mm.breweryName}] ${title.slice(0, 46)} → ${mm.beerName}`);
  } else if (mm.breweryId) { brewOnly++; }
  else { unmatched++; if (sampleUnmatched.length < 20) sampleUnmatched.push(`  ${title.slice(0, 60)}`); }

  if (!DRY) {
    recordListing(db, {
      id: `shelf-${venueSlug}-${extId}-${today}`, beerId: mm.beerId, beerSlug: mm.beerSlug,
      beerNameRaw: title, price: it.price, currency: it.price != null ? "RUB" : undefined,
      volumeMl: it.volumeMl ?? parseVolumeMl(title), format: it.format ?? "can",
      seller: venue, sourceUrl, seenAt: today,
    });
    listings++;
  }
}

console.log(`\nпозиций ${total} | сорт сматчен ${matchedBeer} (auto ${autoCreated}) | только пивоварня ${brewOnly} | не узнано ${unmatched}`);
console.log(`match-rate сорта: ${total ? ((matchedBeer / total) * 100).toFixed(1) : 0}%`);
console.log(`\n— примеры матчей (= линк, + auto-сорт):`); sampleMatched.forEach((s) => console.log(s));
if (sampleUnmatched.length) { console.log(`\n— НЕ узнано (импорт/вне канона):`); sampleUnmatched.forEach((s) => console.log(s)); }
if (!DRY) { console.log(`\nзаписано листингов: ${listings} (format=can/bottle, seller=${venue})`); console.log("STATS:", JSON.stringify(stats(db))); }
db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
db.close();
