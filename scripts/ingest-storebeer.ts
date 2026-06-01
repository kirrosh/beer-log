// DEPRECATED (task-23): заменён единым движком `scripts/ingest-shop-platform.ts storebeer`
// (конфиг в shops.json.ingestConfig). Оставлен до полного регресс-прогона, затем удалить.
// Ингест demand-сигнала с storebeer.ru (StoreBeer, СПб, кастомный движок).
// JSON API: /catalog/json_get_items?page=N → {total_items, items_per_page, current_page, data:[]}
// Поле name: «СОРТ (ПИВОВАРНЯ) 0,45л. X% [ТИП]» — пивоварня в скобках после названия сорта.
// ~98 страниц × 20 товаров = ~1952 товара.
//
//   DRY=1 bun run scripts/ingest-storebeer.ts     # сухой прогон: match-rate + примеры
//   bun run scripts/ingest-storebeer.ts           # запись листингов
import { openDb, recordListing, stats } from "@beer-log/store";
import { buildMatcher } from "./lib/catalog-matcher.ts";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const DRY = !!process.env.DRY;
const SELLER = "storebeer.ru";
const API_BASE = "https://storebeer.ru/catalog/json_get_items";
const PRODUCT_BASE = "https://storebeer.ru/";
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" };
const today = new Date().toISOString().slice(0, 10);
const MAX_PAGES = 110; // выше потолка — стоп по current_page
const NONBEER = /углекислот|co2|баллон|подарочн|сертификат|бокал|стакан|открывал|редуктор|кега\s*пуст|^набор\b/i;

function parsePrice(raw: string): number | undefined {
  // "6 795" → 6795, "445" → 445 (пробелы-разделители тысяч)
  const s = raw.replace(/[\s  ]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? undefined : Math.round(n);
}

function volumeMl(title: string): number | undefined {
  const m = title.match(/(\d+([.,]\d+)?)\s*(мл|ml|л|l)\b/i);
  if (!m) return undefined;
  const v = parseFloat(m[1]!.replace(",", "."));
  return /л|l/i.test(m[3]!) && !/мл|ml/i.test(m[3]!) ? Math.round(v * 1000) : Math.round(v);
}

type ApiItem = {
  id: string;
  url: string;
  name: string;
  price: string;
  discount_price: number | string;
  markdown_price: number | string;
  exists: boolean;
};

type ApiResponse = {
  total_items: number;
  items_per_page: number;
  current_page: number;
  data: ApiItem[];
};

async function fetchPage(page: number): Promise<ApiResponse | null> {
  const url = `${API_BASE}?page=${page}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (res.ok) return await res.json() as ApiResponse;
      if (res.status === 404) return null;
    } catch { /* повтор */ }
    await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
  }
  return null;
}

const db = openDb(DB_PATH);
const matcher = buildMatcher(db, { createAuto: !DRY });
console.log(`матчер: ${matcher.breweryCount} пивоварен / ${matcher.aliasCount} алиасов | DRY=${DRY}`);

let total = 0, matchedBeer = 0, autoCreated = 0, brewOnly = 0, unmatched = 0, skipped = 0, listings = 0;
const sampleMatched: string[] = [], sampleUnmatched: string[] = [];
const seenIds = new Set<string>();

for (let page = 1; page <= MAX_PAGES; page++) {
  const resp = await fetchPage(page);
  if (resp === null) { console.log(`! страница ${page}: фейл/404 — стоп`); break; }

  // Стоп: API вернул не ту страницу (вышли за край пагинации)
  if (resp.current_page < page) {
    console.log(`страница ${page}: API вернул current_page=${resp.current_page} — стоп (конец каталога)`);
    break;
  }

  const items = resp.data;
  if (items.length === 0) { console.log(`страница ${page}: пустой ответ — стоп`); break; }

  // Стоп при повторе: все id уже видены
  if (items.every((it) => seenIds.has(it.id))) {
    console.log(`страница ${page}: всё повтор — стоп`);
    break;
  }

  for (const it of items) {
    if (seenIds.has(it.id)) continue;
    seenIds.add(it.id);

    const title = it.name.trim();
    if (NONBEER.test(title)) { skipped++; continue; }

    total++;

    // Цена: берём discount_price или markdown_price (скидка/уценка), если есть; иначе price
    const discountRaw = it.discount_price;
    const markdownRaw = it.markdown_price;
    const hasDiscount = discountRaw && discountRaw !== 0 && discountRaw !== "0";
    const hasMarkdown = markdownRaw && markdownRaw !== 0 && markdownRaw !== "0";
    const priceRaw = hasDiscount ? String(discountRaw) : hasMarkdown ? String(markdownRaw) : it.price;
    const price = parsePrice(priceRaw);

    const sourceUrl = it.url.startsWith("http") ? it.url : `${PRODUCT_BASE}${it.url}`;

    const mm = matcher.match(title);
    if (mm.beerId) {
      matchedBeer++;
      if (mm.createdAuto) autoCreated++;
      if (sampleMatched.length < 25)
        sampleMatched.push(`${mm.createdAuto ? "+" : "="} [${mm.breweryName}] ${title.slice(0, 50)} → ${mm.beerName}`);
    } else if (mm.breweryId) {
      brewOnly++;
    } else {
      unmatched++;
      if (sampleUnmatched.length < 20) sampleUnmatched.push(`  ${title.slice(0, 65)}`);
    }

    if (!DRY) {
      recordListing(db, {
        id: `sb-${it.id}-${today}`,
        beerId: mm.beerId,
        beerSlug: mm.beerSlug,
        beerNameRaw: title,
        price,
        currency: "RUB",
        volumeMl: volumeMl(title),
        seller: SELLER,
        sourceUrl,
        seenAt: today,
      });
      listings++;
    }
  }

  if (page % 10 === 0) console.log(`…страница ${page}: всего ${total}, сорт-матч ${matchedBeer}`);
  await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1200)); // джиттер анти-бан
}

console.log(`\nтоваров ${total} | сорт сматчен ${matchedBeer} (auto ${autoCreated}) | только пивоварня ${brewOnly} | не узнано ${unmatched} | не-пиво ${skipped}`);
console.log(`match-rate сорта: ${total ? ((matchedBeer / total) * 100).toFixed(1) : 0}%`);
console.log(`\n— примеры матчей:`);
sampleMatched.forEach((s) => console.log(s));
console.log(`\n— НЕ узнано (импорт/мейнстрим/новые пивоварни):`);
sampleUnmatched.forEach((s) => console.log(s));
if (!DRY) { console.log(`\nзаписано листингов: ${listings}`); console.log("STATS:", JSON.stringify(stats(db))); }
db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
db.close();
