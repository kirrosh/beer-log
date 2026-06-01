// DEPRECATED (task-23): заменён единым движком `scripts/ingest-shop-platform.ts kraftbeer-beertrade`
// (конфиг в shops.json.ingestConfig). Оставлен до полного регресс-прогона, затем удалить.
// Ингест demand-сигнала с kraftbeer.ru (WooCommerce Store API → готовый JSON, без скрейпинга HTML).
// Тянет все товары постранично, матчит к канону обобщённым матчером (lib/catalog-matcher):
// росс. крафт → листинг с beer_id (+ auto-сорт, если уверенно), импорт/неузнанное → beer_id=null.
// Цена — целые ₽ как на сайте (дистрибьютор: часто опт/за упаковку — seller помечает источник).
//
//   DRY=1 bun run scripts/ingest-kraftbeer.ts     # сухой прогон: match-rate + примеры, без записи
//   bun run scripts/ingest-kraftbeer.ts           # запись листингов
import { openDb, recordListing, stats } from "@beer-log/store";
import { buildMatcher } from "./lib/catalog-matcher.ts";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const DRY = !!process.env.DRY;
const SELLER = "kraftbeer.ru";
const API = "https://kraftbeer.ru/wp-json/wc/store/products";
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" };
const today = new Date().toISOString().slice(0, 10);
const PER = 100, MAX_PAGES = 40;
// не-пиво (углекислота, мерч, аксессуары) — не матчим/не заводим, но и листингом не нужно
const NONBEER = /углекислот|co2|баллон|подарочн|сертификат|бокал|стакан|открывал|мерч|футболк|кега\s*пуст|редуктор/i;

const dec = (s: string) =>
  s.replace(/&#8220;|&#8221;|&laquo;|&raquo;|&quot;/g, '"').replace(/&#8211;|&#8212;/g, "-")
   .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim();

function volumeMl(title: string): number | undefined {
  const m = title.match(/(\d+([.,]\d+)?)\s*(мл|ml|л|l)\b/i);
  if (!m) return undefined;
  const v = parseFloat(m[1]!.replace(",", "."));
  return /л|l/i.test(m[3]!) && !/мл|ml/i.test(m[3]!) ? Math.round(v * 1000) : Math.round(v);
}

async function fetchPage(page: number): Promise<any[] | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${API}?per_page=${PER}&page=${page}`, { headers: UA });
      if (!res.ok) { if (res.status === 400 || res.status === 404) return []; continue; }
      return (await res.json()) as any[];
    } catch { /* повтор */ }
  }
  return null;
}

const db = openDb(DB_PATH);
const matcher = buildMatcher(db, { createAuto: !DRY });
console.log(`матчер: ${matcher.breweryCount} пивоварен / ${matcher.aliasCount} алиасов | DRY=${DRY}`);

let total = 0, matchedBeer = 0, matchedBrewOnly = 0, autoCreated = 0, unmatched = 0, skipped = 0, listings = 0;
const sampleMatched: string[] = [], sampleUnmatched: string[] = [];

for (let page = 1; page <= MAX_PAGES; page++) {
  const products = await fetchPage(page);
  if (products === null) { console.log(`! страница ${page}: 3 фейла подряд — стоп`); break; }
  if (products.length === 0) break;
  for (const p of products) {
    const title = dec(p.name ?? "");
    if (!title || NONBEER.test(title)) { skipped++; continue; }
    total++;
    const priceRub = p.prices?.price != null ? parseInt(p.prices.price, 10) : undefined;
    const m = matcher.match(title);
    if (m.beerId) {
      matchedBeer++;
      if (m.createdAuto) autoCreated++;
      if (sampleMatched.length < 25) sampleMatched.push(`${m.createdAuto ? "+" : "="} [${m.breweryName}] ${title.slice(0, 50)} → ${m.beerName}`);
    } else if (m.breweryId) {
      matchedBrewOnly++;
    } else {
      unmatched++;
      if (sampleUnmatched.length < 25) sampleUnmatched.push(`  ${title.slice(0, 60)}`);
    }
    if (!DRY) {
      recordListing(db, {
        id: `kb-${p.id}-${today}`, beerId: m.beerId, beerSlug: m.beerSlug,
        beerNameRaw: title, price: Number.isFinite(priceRub) ? priceRub : undefined,
        currency: "RUB", volumeMl: volumeMl(title), seller: SELLER,
        sourceUrl: p.permalink, seenAt: today,
      });
      listings++;
    }
  }
  if (products.length < PER) break;
}

console.log(`\nтоваров ${total} | сорт сматчен ${matchedBeer} (auto-создано ${autoCreated}) | только пивоварня ${matchedBrewOnly} | не узнано ${unmatched} | пропущено не-пиво ${skipped}`);
console.log(`match-rate сорта: ${total ? ((matchedBeer / total) * 100).toFixed(1) : 0}%`);
console.log(`\n— примеры матчей (= линк, + auto-сорт):`);
sampleMatched.forEach((s) => console.log(s));
console.log(`\n— примеры НЕ узнанных (импорт/мейнстрим/чужие):`);
sampleUnmatched.forEach((s) => console.log(s));
if (!DRY) { console.log(`\nзаписано листингов: ${listings}`); console.log("STATS:", JSON.stringify(stats(db))); }
db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
db.close();
