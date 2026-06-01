// DEPRECATED (task-23): заменён единым движком `scripts/ingest-shop-platform.ts pivokom`
// (конфиг в shops.json.ingestConfig). Оставлен до полного регресс-прогона, затем удалить.
// Ингест demand-сигнала с pivokom.ru («Народные напитки», Bitrix, server-rendered каталог).
// Раздел «Крафтовое пиво в бутылках и банках», пагинация ?PAGEN_1=N (≈74 стр × ~24 товара).
// Карточка: class="item-title"><a href=URL><span>TITLE</span>, цена class="price" data-value=...
// Матч к канону — общим lib/catalog-matcher (по названию: пивоварня + isSameBeer внутри сортов).
// Розничные ₽ за ед. (в отличие от оптового kraftbeer) — полноценный сигнал спроса.
//
//   DRY=1 bun run scripts/ingest-pivokom.ts     # сухой прогон: match-rate + примеры
//   bun run scripts/ingest-pivokom.ts           # запись листингов
import { openDb, recordListing, stats } from "@beer-log/store";
import { buildMatcher } from "./lib/catalog-matcher.ts";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const DRY = !!process.env.DRY;
const SELLER = "pivokom.ru";
const BASE = "https://pivokom.ru/catalog/kraftovoe_pivo_v_butylkakh_i_bankakh/";
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" };
const today = new Date().toISOString().slice(0, 10);
const MAX_PAGES = 90;
const NONBEER = /углекислот|co2|баллон|подарочн|сертификат|бокал|стакан|открывал|редуктор|кега\s*пуст|^набор\b/i;

const dec = (s: string) =>
  s.replace(/&laquo;|&raquo;|&quot;|&#8220;|&#8221;/g, '"').replace(/&#8211;|&#8212;/g, "-")
   .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim();

function volumeMl(title: string): number | undefined {
  const m = title.match(/(\d+([.,]\d+)?)\s*(мл|ml|л|l)\b/i);
  if (!m) return undefined;
  const v = parseFloat(m[1]!.replace(",", "."));
  return /л|l/i.test(m[3]!) && !/мл|ml/i.test(m[3]!) ? Math.round(v * 1000) : Math.round(v);
}

type Item = { id: string; title: string; url: string; price?: number };
// разобрать одну страницу каталога Bitrix: товары идут блоками item-title → ближайшая .price
function parsePage(html: string): Item[] {
  const out: Item[] = [];
  const re = /class="item-title">\s*<a\s+href="([^"]+)"[^>]*>\s*(?:<span>)?([\s\S]*?)(?:<\/span>)?<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const url = m[1]!;
    const idm = url.match(/\/(\d+)\/?$/);
    const title = dec(m[2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
    if (!title) continue;
    // цена: первый блок .price data-value после заголовка (в пределах карточки ~4000 симв.)
    const tail = html.slice(m.index, m.index + 4000);
    const pm = tail.match(/class="price"[^>]*data-value="([\d.]+)"/);
    const price = pm ? Math.round(parseFloat(pm[1]!)) : undefined;
    out.push({ id: idm ? idm[1]! : url, title, url: url.startsWith("http") ? url : `https://pivokom.ru${url}`, price });
  }
  return out;
}

async function fetchPage(page: number): Promise<string | null> {
  const url = page > 1 ? `${BASE}?PAGEN_1=${page}` : BASE;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (res.ok) return await res.text();
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
  const html = await fetchPage(page);
  if (html === null) { console.log(`! страница ${page}: фейл/404 — стоп`); break; }
  const items = parsePage(html);
  if (items.length === 0) break;
  // стоп при повторе (пагинация вышла за край → отдаёт первую): все id уже видены
  if (items.every((it) => seenIds.has(it.id))) { console.log(`страница ${page}: всё повтор — стоп`); break; }
  for (const it of items) {
    if (seenIds.has(it.id)) continue;
    seenIds.add(it.id);
    if (NONBEER.test(it.title)) { skipped++; continue; }
    total++;
    const mm = matcher.match(it.title);
    if (mm.beerId) {
      matchedBeer++;
      if (mm.createdAuto) autoCreated++;
      if (sampleMatched.length < 25) sampleMatched.push(`${mm.createdAuto ? "+" : "="} [${mm.breweryName}] ${it.title.slice(0, 48)} → ${mm.beerName}`);
    } else if (mm.breweryId) { brewOnly++; }
    else { unmatched++; if (sampleUnmatched.length < 20) sampleUnmatched.push(`  ${it.title.slice(0, 62)}`); }
    if (!DRY) {
      recordListing(db, {
        id: `pk-${it.id}-${today}`, beerId: mm.beerId, beerSlug: mm.beerSlug,
        beerNameRaw: it.title, price: it.price, currency: "RUB",
        volumeMl: volumeMl(it.title), seller: SELLER, sourceUrl: it.url, seenAt: today,
      });
      listings++;
    }
  }
  if (page % 15 === 0) console.log(`…страница ${page}: всего ${total}, сорт-матч ${matchedBeer}`);
  await new Promise((r) => setTimeout(r, 1200 + Math.random() * 1600)); // джиттер анти-бан
}

console.log(`\nтоваров ${total} | сорт сматчен ${matchedBeer} (auto ${autoCreated}) | только пивоварня ${brewOnly} | не узнано ${unmatched} | не-пиво ${skipped}`);
console.log(`match-rate сорта: ${total ? ((matchedBeer / total) * 100).toFixed(1) : 0}%`);
console.log(`\n— примеры матчей:`); sampleMatched.forEach((s) => console.log(s));
console.log(`\n— НЕ узнано (импорт/мейнстрим/новые пивоварни):`); sampleUnmatched.forEach((s) => console.log(s));
if (!DRY) { console.log(`\nзаписано листингов: ${listings}`); console.log("STATS:", JSON.stringify(stats(db))); }
db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
db.close();
