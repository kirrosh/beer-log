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
//
// Бот (beer-concierge, #4 фото борда) НЕ может создавать файлы (нет Write/Bash-записи в allowlist),
// поэтому принимает ту же структуру inline через --json (как record-tasting). Дефолтный провенанс
// при inline = ai-vision (фото распознано на месте), при файле остаётся web-photo (исторический ingest).
//   bun run scripts/beerlog.ts shelf --json '{"venue":"beermug-nn/gagarina-118","items":[…]}'
import { Database } from "bun:sqlite";
import { openDb, recordListing, stats } from "@beer-log/store";
import { parseVolumeMl, looksLikeBeerLine, type ShopFormat } from "@beer-log/parsers";
import { buildMatcher } from "./lib/catalog-matcher.ts";
import { tier, type SourceType } from "./lib/provenance.ts";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const DRY = !!process.env.DRY;
const today = new Date().toISOString().slice(0, 10);

interface ShelfItem {
  brewery?: string; sort?: string; abv?: number; style?: string;
  format?: ShopFormat; price?: number; volumeMl?: number;
  // провенанс на item (переопределяет файловый): для агрегата фото с разными датами/источниками
  observedAt?: string; sourceType?: SourceType; sourceUrl?: string;
}
type ShelfDoc = {
  venue?: string; sourceUrl?: string; sourceType?: SourceType; observedAt?: string; items?: ShelfItem[];
};

// вход: либо файл (исторический ingest), либо inline --json (бот). Дефолт провенанса зависит от пути:
// inline = ai-vision (фото на месте, бот не пишет файлы), файл = web-photo (старый веб-фетч).
const jsonIdx = process.argv.indexOf("--json");
const inline = jsonIdx >= 0 ? process.argv[jsonIdx + 1] : undefined;
const file = inline ? undefined : process.argv[2];
let raw: ShelfDoc;
let defaultSourceType: SourceType;
if (inline) {
  try { raw = JSON.parse(inline) as ShelfDoc; } catch { console.error("! --json: невалидный JSON"); process.exit(1); }
  defaultSourceType = "ai-vision";
} else if (file) {
  raw = await Bun.file(file).json() as ShelfDoc;
  defaultSourceType = "web-photo";
} else {
  console.error("Укажи источник: <shelf-*.json> или --json '{…}'"); process.exit(1);
}

const venue = raw.venue;
if (!venue) { console.error(`! нет поля "venue" (seller точки)`); process.exit(1); }
const fileSourceUrl = raw.sourceUrl ?? (inline ? "shelf-vision" : "shelf-photo");
// провенанс по умолчанию для всего документа (см. defaultSourceType выше; lib/provenance.ts).
const fileSourceType: SourceType = raw.sourceType || defaultSourceType;
const fileObservedAt = raw.observedAt || today;
const venueSlug = venue.split("/").pop()!;

// DRY → readonly-открытие (openDb всегда пишет journal_mode=WAL + migrate, что мутирует файл и
// шумит в git даже без записи листингов). Реальный ингест — через openDb (WAL + миграции).
const db = (DRY ? new Database(DB_PATH, { readonly: true }) : openDb(DB_PATH)) as ReturnType<typeof openDb>;
const matcher = buildMatcher(db, { createAuto: !DRY });
const ft = tier({ sourceType: fileSourceType, observedAt: fileObservedAt });
console.log(`=== Холодильник ${venue} · ${file ? `файл ${file}` : "inline --json"} · DRY=${DRY} ===`);
console.log(`матчер: ${matcher.breweryCount} пивоварен / ${matcher.aliasCount} алиасов`);
console.log(`провенанс: ${fileSourceType} · наблюдение ${fileObservedAt} · tier=${ft.level} (${ft.score}) «${ft.label}»`);

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
    const observedAt = it.observedAt ?? fileObservedAt;
    recordListing(db, {
      id: `shelf-${venueSlug}-${extId}-${observedAt}`, beerId: mm.beerId, beerSlug: mm.beerSlug,
      beerNameRaw: title, price: it.price, currency: it.price != null ? "RUB" : undefined,
      volumeMl: it.volumeMl ?? parseVolumeMl(title), format: it.format ?? "can",
      seller: venue, sourceUrl: it.sourceUrl ?? fileSourceUrl, seenAt: observedAt,
      sourceType: it.sourceType ?? fileSourceType,
    });
    listings++;
  }
}

console.log(`\nпозиций ${total} | сорт сматчен ${matchedBeer} (auto ${autoCreated}) | только пивоварня ${brewOnly} | не узнано ${unmatched}`);
console.log(`match-rate сорта: ${total ? ((matchedBeer / total) * 100).toFixed(1) : 0}%`);
console.log(`\n— примеры матчей (= линк, + auto-сорт):`); sampleMatched.forEach((s) => console.log(s));
if (sampleUnmatched.length) { console.log(`\n— НЕ узнано (импорт/вне канона):`); sampleUnmatched.forEach((s) => console.log(s)); }
if (!DRY) {
  console.log(`\nзаписано листингов: ${listings} (format=can/bottle, seller=${venue})`);
  console.log("STATS:", JSON.stringify(stats(db)));
  // журнал трогаем только при реальной записи — иначе DRY-прогон шумит в git (catalog.sqlite mtime/journal)
  db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
}
db.close();
