// Ингест demand-сигнала с rusbeershop.ru («РусБир Варшавка», Bitrix, server-rendered каталог).
// Категории: «Русский крафт» (~217 стр × 40 товаров), «Российское» (~4 стр), «Разливное» (1 стр).
// Карточка: class="item-title"><a href=URL class="dark_link"><span>TITLE</span>, цена — data-value=... внутри class="price".
// Пагинация Bitrix: ?PAGEN_1=N. Стоп при повторе id (Bitrix отдаёт стр.1 при выходе за край).
// Розничные ₽ за ед. — полноценный сигнал спроса.
//
//   DRY=1 bun run scripts/ingest-rusbeershop.ts     # сухой прогон: match-rate + примеры
//   bun run scripts/ingest-rusbeershop.ts           # запись листингов
import { openDb, recordListing, stats } from "@beer-log/store";
import { buildMatcher } from "./lib/catalog-matcher.ts";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const DRY = !!process.env.DRY;
const SELLER = "rusbeershop.ru";
const BASE_URL = "https://rusbeershop.ru";
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" };
const today = new Date().toISOString().slice(0, 10);
const MAX_PAGES = 300;
const NONBEER = /углекислот|co2|баллон|подарочн|сертификат|бокал|стакан|открывал|редуктор|кега\s*пуст|^набор\b/i;

// Категории: [slug, maxPages, includeInCanonMatch]
// razlivnoe — 1 стр, там кеги (пустой href), матч по возможности
const CATEGORIES: Array<{ slug: string; label: string; maxPages: number }> = [
  { slug: "russkiy_kraft",  label: "Русский крафт",  maxPages: 300 },
  { slug: "rossiyskoe",     label: "Российское",     maxPages: 10  },
  { slug: "razlivnoe-pivo", label: "Разливное пиво", maxPages: 5   },
];

const dec = (s: string) =>
  s.replace(/&laquo;|&raquo;|&quot;|&#8220;|&#8221;/g, '"')
   .replace(/&#8211;|&#8212;/g, "-")
   .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
   .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim();

function volumeMl(title: string): number | undefined {
  const m = title.match(/(\d+([.,]\d+)?)\s*(мл|ml|л|l)\b/i);
  if (!m) return undefined;
  const v = parseFloat(m[1]!.replace(",", "."));
  return /л|l/i.test(m[3]!) && !/мл|ml/i.test(m[3]!) ? Math.round(v * 1000) : Math.round(v);
}

type Item = { id: string; title: string; url: string; price?: number };

// Разбор одной страницы каталога Bitrix rusbeershop.
// Разметка: class="item-title"> <a href="/catalog/beer-NNNNN/" class="dark_link"><span>TITLE</span>
// Цена: data-value="NNN" в блоке class="price" (находится в ~4000 симв. после заголовка)
function parsePage(html: string, baseUrl: string): Item[] {
  const out: Item[] = [];
  // rusbeershop: href может быть пустым (разливные кеги) — исключаем пустые href
  const re = /class="item-title">\s*<a\s+href="([^"]+)"[^>]*>\s*(?:<span>)?([\s\S]*?)(?:<\/span>)?<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[1]!;
    if (!href || href === "#") continue; // пропускаем пустые/якорные ссылки (кеги без страницы)
    const idm = href.match(/beer-(\d+)\/?$/);
    if (!idm) continue; // только товары вида /catalog/beer-NNNNN/
    const rawTitle = m[2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const title = dec(rawTitle);
    if (!title) continue;
    // Цена: data-value="NNN" в первом блоке class="price" после заголовка (в ~5000 симв.)
    const tail = html.slice(m.index, m.index + 5000);
    const pm = tail.match(/data-value="([\d.]+)"/);
    const price = pm ? Math.round(parseFloat(pm[1]!)) : undefined;
    const url = href.startsWith("http") ? href : `${baseUrl}${href}`;
    out.push({ id: idm[1]!, title, url, price });
  }
  return out;
}

async function fetchPage(categorySlug: string, page: number): Promise<string | null> {
  const base = `${BASE_URL}/catalog/${categorySlug}/`;
  const url = page > 1 ? `${base}?PAGEN_1=${page}` : base;
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

// Глобальный дедуп по id товара (один товар может быть в нескольких категориях)
const seenIds = new Set<string>();

for (const cat of CATEGORIES) {
  console.log(`\n=== Категория: ${cat.label} (/${cat.slug}/) ===`);
  let catTotal = 0;
  const catSeenIds = new Set<string>(); // для стоп-условия повтора в пределах категории

  for (let page = 1; page <= cat.maxPages; page++) {
    const html = await fetchPage(cat.slug, page);
    if (html === null) { console.log(`! стр ${page}: фейл/404 — стоп`); break; }
    const items = parsePage(html, BASE_URL);
    if (items.length === 0) { console.log(`стр ${page}: 0 товаров — стоп`); break; }

    // Стоп при повторе (Bitrix отдаёт стр.1 при выходе за край пагинации)
    if (items.every((it) => catSeenIds.has(it.id))) {
      console.log(`стр ${page}: все id уже видены — стоп`);
      break;
    }

    for (const it of items) {
      if (catSeenIds.has(it.id)) continue;
      catSeenIds.add(it.id);

      // Глобальный дедуп (товар может быть в нескольких категориях)
      if (seenIds.has(it.id)) continue;
      seenIds.add(it.id);

      if (NONBEER.test(it.title)) { skipped++; continue; }
      total++;
      catTotal++;

      const mm = matcher.match(it.title);
      if (mm.beerId) {
        matchedBeer++;
        if (mm.createdAuto) autoCreated++;
        if (sampleMatched.length < 25) sampleMatched.push(`${mm.createdAuto ? "+" : "="} [${mm.breweryName}] ${it.title.slice(0, 48)} → ${mm.beerName}`);
      } else if (mm.breweryId) {
        brewOnly++;
      } else {
        unmatched++;
        if (sampleUnmatched.length < 25) sampleUnmatched.push(`  ${it.title.slice(0, 62)}`);
      }

      if (!DRY) {
        recordListing(db, {
          id: `rbs-${it.id}-${today}`,
          beerId: mm.beerId,
          beerSlug: mm.beerSlug,
          beerNameRaw: it.title,
          price: it.price,
          currency: "RUB",
          volumeMl: volumeMl(it.title),
          seller: SELLER,
          sourceUrl: it.url,
          seenAt: today,
        });
        listings++;
      }
    }

    if (page % 20 === 0) console.log(`  …стр ${page}: кат. ${catTotal}, всего ${total}, сорт-матч ${matchedBeer}`);
    await new Promise((r) => setTimeout(r, 1200 + Math.random() * 1600));
  }
  console.log(`  итого в категории: ${catTotal} товаров (уникальных, новых)`);
}

console.log(`\n====================================`);
console.log(`товаров ${total} | сорт сматчен ${matchedBeer} (auto ${autoCreated}) | только пивоварня ${brewOnly} | не узнано ${unmatched} | не-пиво ${skipped}`);
console.log(`match-rate сорта: ${total ? ((matchedBeer / total) * 100).toFixed(1) : 0}%`);
console.log(`\n— примеры матчей:`);
sampleMatched.forEach((s) => console.log(s));
console.log(`\n— НЕ узнано (импорт/мейнстрим/новые пивоварни):`);
sampleUnmatched.forEach((s) => console.log(s));
if (!DRY) {
  console.log(`\nзаписано листингов: ${listings}`);
  console.log("STATS:", JSON.stringify(stats(db)));
}
db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
db.close();
