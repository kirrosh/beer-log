// Движок единого shop-ingest по платформе (task-23): сеть + пагинация + общий пайплайн
// (matcher → recordListing → stats/примеры). Платформо-специфичен только адаптер добычи
// страниц; всё остальное — общее. Заменяет bespoke-скрипты на магазин: новый магазин =
// конфиг в `data/pipeline/shops.json`, а не новый скрипт.
//
// Чистые парсеры разметки — в `@beer-log/parsers` (shops/platforms.ts). Здесь — сеть+оркестрация.
import { recordListing, stats } from "@beer-log/store";
import {
  parseWoocommerce, parseBitrixCatalog, parseStorebeerPage, parseTelegramTapList,
  parseChannelHtml, NONBEER, looksLikeBeerLine, type ShopItem,
} from "@beer-log/parsers";
import { buildMatcher } from "./catalog-matcher.ts";
import type { Database } from "bun:sqlite";

export type ShopPlatform = "woocommerce" | "bitrix" | "custom-json" | "telegram" | "prose";

/** Конфиг магазина для движка — кладётся в shops.json (`ingestConfig`). */
export interface ShopIngestConfig {
  platform: ShopPlatform;
  seller: string;
  /** префикс id листинга: `${idPrefix}-${extId}-${date}` (kb/pk/sb/rbs/vc) */
  idPrefix: string;
  // woocommerce
  endpoint?: string;
  // bitrix: полные базовые URL категорий (пагинация ?PAGEN_1=N), + извлечение id
  catalogs?: string[];
  baseUrl?: string;
  idRegex?: string;      // источник regex, напр. "beer-(\\d+)" или "/(\\d+)/?$"
  requireId?: boolean;
  pagenParam?: string;   // имя параметра пагинации Bitrix, если не PAGEN_1 (напр. PAGEN_2 — fish-business)
  // custom-json (storebeer)
  apiBase?: string;
  productBase?: string;
  // telegram (бар → тап-лист)
  handle?: string;
  sourceUrl?: string;
  // prose (бар/блог без структуры → LLM-извлечённые кандидаты сортов)
  proseFile?: string;    // путь к JSON {items:[{brewery,sort,style?,date?}]} (см. ingest-prose flow)
  // общее
  maxPages?: number;     // потолок пагинации (по умолчанию по платформе)
}

const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" };
const TG_UA = { "User-Agent": "Mozilla/5.0 (compatible; beer-log/0.1)" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url: string, headers = UA): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.ok) return await res.text();
      if (res.status === 404) return null;
    } catch { /* повтор */ }
    await sleep(1500 + Math.random() * 1500);
  }
  return null;
}

// ── адаптеры платформ: async-генераторы страниц ShopItem[] (своя пагинация + стоп) ──

async function* woocommercePages(cfg: ShopIngestConfig): AsyncGenerator<ShopItem[]> {
  const PER = 100, MAX = cfg.maxPages ?? 40;
  for (let page = 1; page <= MAX; page++) {
    const text = await fetchText(`${cfg.endpoint}?per_page=${PER}&page=${page}`);
    if (text === null) break;
    let products: any[];
    try { products = JSON.parse(text); } catch { break; }
    if (!Array.isArray(products) || products.length === 0) break;
    yield parseWoocommerce(products);
    if (products.length < PER) break;
  }
}

async function* bitrixPages(cfg: ShopIngestConfig): AsyncGenerator<ShopItem[]> {
  const MAX = cfg.maxPages ?? 300;
  const idRegex = cfg.idRegex ? new RegExp(cfg.idRegex) : undefined;
  const pagen = cfg.pagenParam ?? "PAGEN_1";   // у части шаблонов пагинатор второй (PAGEN_2)
  for (const base of cfg.catalogs ?? []) {
    const catSeen = new Set<string>();       // стоп-условие в пределах категории (Bitrix wrap → стр.1)
    for (let page = 1; page <= MAX; page++) {
      const url = page > 1 ? `${base}?${pagen}=${page}` : base;
      const html = await fetchText(url);
      if (html === null) break;
      const items = parseBitrixCatalog(html, { baseUrl: cfg.baseUrl!, idRegex, requireId: cfg.requireId });
      if (items.length === 0) break;
      if (items.every((it) => catSeen.has(it.extId))) break;  // вышли за край → отдаёт стр.1
      for (const it of items) catSeen.add(it.extId);
      yield items;
      await sleep(1200 + Math.random() * 1600);               // джиттер анти-бан
    }
  }
}

async function* customJsonPages(cfg: ShopIngestConfig): AsyncGenerator<ShopItem[]> {
  const MAX = cfg.maxPages ?? 110;
  for (let page = 1; page <= MAX; page++) {
    const text = await fetchText(`${cfg.apiBase}?page=${page}`);
    if (text === null) break;
    let resp: any;
    try { resp = JSON.parse(text); } catch { break; }
    const { items, currentPage } = parseStorebeerPage(resp, cfg.productBase ?? "");
    if (currentPage < page) break;          // API вернул не ту страницу → конец
    if (items.length === 0) break;
    yield items;
    await sleep(1000 + Math.random() * 1200);
  }
}

async function* telegramPages(cfg: ShopIngestConfig): AsyncGenerator<ShopItem[]> {
  const html = await fetchText(`https://t.me/s/${cfg.handle}`, TG_UA);
  if (html === null) return;
  yield parseTelegramTapList(parseChannelHtml(html));
}

// prose: прозаический источник (TG-проза / блог-анонсы) без машинной структуры. Извлечение
// кандидатов {brewery, sort} делает LLM-субагент → JSON-файл (regex прозу не берёт). Здесь —
// детерминированно: читаем файл, склеиваем «Пивоварня Сорт» в title → общий matcher как у telegram.
interface ProseItem { brewery?: string; sort?: string; style?: string; date?: string }
async function* prosePages(cfg: ShopIngestConfig): AsyncGenerator<ShopItem[]> {
  if (!cfg.proseFile) return;
  const file = Bun.file(cfg.proseFile);
  if (!(await file.exists())) { console.error(`! prose: файл не найден ${cfg.proseFile}`); return; }
  const raw = await file.json() as { items?: ProseItem[] };
  const items: ShopItem[] = [];
  for (const p of raw.items ?? []) {
    const brewery = (p.brewery ?? "").trim();
    const sort = (p.sort ?? "").trim();
    if (!sort && !brewery) continue;
    const title = [brewery, sort].filter(Boolean).join(" ").replace(/\s+/g, " ");
    const extId = `${brewery}-${sort}`.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
    if (!extId) continue;
    items.push({ extId, title, format: "draft" });
  }
  yield items;
}

function platformPages(cfg: ShopIngestConfig): AsyncGenerator<ShopItem[]> {
  switch (cfg.platform) {
    case "woocommerce": return woocommercePages(cfg);
    case "bitrix":      return bitrixPages(cfg);
    case "custom-json": return customJsonPages(cfg);
    case "telegram":    return telegramPages(cfg);
    case "prose":       return prosePages(cfg);
  }
}

export interface IngestResult {
  total: number; matchedBeer: number; autoCreated: number; brewOnly: number;
  unmatched: number; skipped: number; listings: number;
}

/**
 * Прогон ингеста магазина: сеть+пагинация по платформе → matcher → recordListing.
 * `dry` — сухой прогон (без записи и без auto-сортов). `today` — дата снапшота (id листинга).
 */
export async function runShopIngest(
  db: Database, cfg: ShopIngestConfig, opts: { dry: boolean; today: string },
): Promise<IngestResult> {
  const { dry, today } = opts;
  // draft-источники без цены (telegram-тап-лист / prose-анонсы): NONBEER не применяем,
  // берём позицию, если узнали пивоварню ИЛИ строка похожа на пиво.
  const isDraft = cfg.platform === "telegram" || cfg.platform === "prose";
  const matcher = buildMatcher(db, { createAuto: !dry });
  console.log(`матчер: ${matcher.breweryCount} пивоварен / ${matcher.aliasCount} алиасов | DRY=${dry}`);

  const r: IngestResult = { total: 0, matchedBeer: 0, autoCreated: 0, brewOnly: 0, unmatched: 0, skipped: 0, listings: 0 };
  const sampleMatched: string[] = [], sampleUnmatched: string[] = [];
  const seen = new Set<string>();            // глобальный дедуп по extId (товар в неск. категориях/постах)
  let page = 0;

  for await (const items of platformPages(cfg)) {
    page++;
    for (const it of items) {
      if (seen.has(it.extId)) continue;
      const mm = matcher.match(it.title);
      if (isDraft) {
        if (!mm.breweryId && !looksLikeBeerLine(it.title)) continue;
      } else if (NONBEER.test(it.title)) { r.skipped++; seen.add(it.extId); continue; }
      seen.add(it.extId);
      r.total++;
      if (mm.beerId) {
        r.matchedBeer++;
        if (mm.createdAuto) r.autoCreated++;
        if (sampleMatched.length < 25) sampleMatched.push(`${mm.createdAuto ? "+" : "="} [${mm.breweryName}] ${it.title.slice(0, 48)} → ${mm.beerName}`);
      } else if (mm.breweryId) { r.brewOnly++; }
      else { r.unmatched++; if (sampleUnmatched.length < 20) sampleUnmatched.push(`  ${it.title.slice(0, 62)}`); }
      if (!dry) {
        recordListing(db, {
          id: `${cfg.idPrefix}-${it.extId}-${today}`, beerId: mm.beerId, beerSlug: mm.beerSlug,
          beerNameRaw: it.title, price: it.price, currency: it.price != null ? "RUB" : undefined,
          volumeMl: it.volumeMl, format: it.format, seller: cfg.seller,
          sourceUrl: it.sourceUrl ?? cfg.sourceUrl, seenAt: today,
        });
        r.listings++;
      }
    }
    if (page % 10 === 0) console.log(`…страница ${page}: всего ${r.total}, сорт-матч ${r.matchedBeer}`);
  }

  console.log(`\nпозиций ${r.total} | сорт сматчен ${r.matchedBeer} (auto ${r.autoCreated}) | только пивоварня ${r.brewOnly} | не узнано ${r.unmatched} | не-пиво ${r.skipped}`);
  console.log(`match-rate сорта: ${r.total ? ((r.matchedBeer / r.total) * 100).toFixed(1) : 0}%`);
  console.log(`\n— примеры матчей (= линк, + auto-сорт):`); sampleMatched.forEach((s) => console.log(s));
  console.log(`\n— НЕ узнано (импорт/мейнстрим/вне канона):`); sampleUnmatched.forEach((s) => console.log(s));
  if (!dry) { console.log(`\nзаписано листингов: ${r.listings}`); console.log("STATS:", JSON.stringify(stats(db))); }
  return r;
}
