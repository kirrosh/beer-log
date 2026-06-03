// Чистые парсеры витрин ПО ПЛАТФОРМЕ (task-23): из ответа источника → нормализованные
// ShopItem[]. Без сети — основа теста/самопроверки разметки. Сеть + пагинация + матч +
// запись листингов живут в движке `scripts/lib/shop-ingest.ts`, который зовёт эти функции.
//
// Платформы: woocommerce (Store API JSON), bitrix (server-rendered каталог + ?PAGEN_1),
// custom-json (storebeer json_get_items), telegram (тап-лист бара t.me/s).
import type { ShopFormat } from "./insales.ts";

/** Нормализованная позиция витрины — общий контракт для всех платформ. */
export interface ShopItem {
  /** стабильный id товара в пределах магазина (для id листинга + дедуп пагинации) */
  extId: string;
  /** сырой заголовок товара (пивоварня + сорт + объём + тип) */
  title: string;
  /** цена ₽, целое (может отсутствовать — бары/кеги без цены) */
  price?: number;
  /** объём единицы в мл (из заголовка) */
  volumeMl?: number;
  /** формат, если платформа знает явно (telegram-бар → draft); иначе деривация из title */
  format?: ShopFormat;
  /** ссылка на карточку товара/источник */
  sourceUrl?: string;
  /** платформа знает скидку явно (storebeer); иначе recordListing выведет относительно снапшота */
  discounted?: boolean;
}

/** Раскодировать HTML-сущности (кавычки/тире/амперсанд/числовые). */
export function decodeEntities(s: string): string {
  return s
    .replace(/&laquo;|&raquo;|&quot;|&#8220;|&#8221;/g, '"')
    .replace(/&#8211;|&#8212;/g, "-")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .trim();
}

/** Объём единицы в мл из заголовка («0,5 л» → 500, «330 мл» → 330). */
export function parseVolumeMl(title: string): number | undefined {
  const m = title.match(/(\d+([.,]\d+)?)\s*(мл|ml|л|l)\b/i);
  if (!m) return undefined;
  const v = parseFloat(m[1]!.replace(",", "."));
  return /л|l/i.test(m[3]!) && !/мл|ml/i.test(m[3]!) ? Math.round(v * 1000) : Math.round(v);
}

/** Не-пиво (углекислота, мерч, аксессуары, наборы) — отсев общим фильтром на движке. */
export const NONBEER =
  /углекислот|co2|баллон|подарочн|сертификат|бокал|стакан|открывал|редуктор|кега\s*пуст|мерч|футболк|^набор\b/i;

// ── woocommerce (Store API JSON: kraftbeer.ru/wp-json/wc/store/products) ──────
type WooProduct = { id: number | string; name?: string; permalink?: string; prices?: { price?: string } };
export function parseWoocommerce(products: WooProduct[]): ShopItem[] {
  const out: ShopItem[] = [];
  for (const p of products) {
    const title = decodeEntities(p.name ?? "");
    if (!title) continue;
    // цена как на сайте — целое (дистрибьютор-опт; розничный фильтр опта — на экспорте)
    const price = p.prices?.price != null ? parseInt(String(p.prices.price), 10) : undefined;
    out.push({
      extId: String(p.id), title,
      price: Number.isFinite(price as number) ? (price as number) : undefined,
      volumeMl: parseVolumeMl(title), sourceUrl: p.permalink,
    });
  }
  return out;
}

// ── bitrix (server-rendered каталог: pivokom / rusbeershop) ───────────────────
// Карточка: class="item-title"><a href=URL ...><span>TITLE</span>; цена data-value="NNN".
export interface BitrixOpts {
  /** база сайта для абсолютизации относительных href (https://pivokom.ru) */
  baseUrl: string;
  /** извлечь id из href; если не дан — id = href. requireId отсекает href без id (кеги). */
  idRegex?: RegExp;
  requireId?: boolean;
}
export function parseBitrixCatalog(html: string, opts: BitrixOpts): ShopItem[] {
  const out: ShopItem[] = [];
  const re = /class="item-title">\s*<a\s+href="([^"]+)"[^>]*>\s*(?:<span>)?([\s\S]*?)(?:<\/span>)?<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[1]!;
    if (!href || href === "#") continue; // пустые/якорные (кеги без страницы)
    let extId = href;
    if (opts.idRegex) {
      const idm = href.match(opts.idRegex);
      if (idm) extId = idm[1]!;
      else if (opts.requireId) continue;
    }
    const title = decodeEntities(m[2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
    if (!title) continue;
    // цена: первый data-value в карточке (в ~5000 симв. после заголовка)
    const tail = html.slice(m.index, m.index + 5000);
    const pm = tail.match(/data-value="([\d.]+)"/);
    const price = pm ? Math.round(parseFloat(pm[1]!)) : undefined;
    const sourceUrl = href.startsWith("http") ? href : `${opts.baseUrl}${href}`;
    out.push({ extId, title, price, volumeMl: parseVolumeMl(title), sourceUrl });
  }
  return out;
}

// ── custom-json (storebeer: /catalog/json_get_items?page=N) ───────────────────
export interface StorebeerResponse {
  total_items?: number; items_per_page?: number; current_page?: number;
  data?: Array<{ id: string; url: string; name: string; price: string;
    discount_price?: number | string; markdown_price?: number | string; exists?: boolean }>;
}
function parsePriceSpaced(raw: string): number | undefined {
  const n = parseFloat(raw.replace(/[\s  ]/g, ""));
  return isNaN(n) ? undefined : Math.round(n);
}
/** Нормализовать страницу storebeer. Возвращает {items, currentPage} для стоп-условия. */
export function parseStorebeerPage(resp: StorebeerResponse, productBase: string): { items: ShopItem[]; currentPage: number } {
  const items: ShopItem[] = [];
  for (const it of resp.data ?? []) {
    const title = (it.name ?? "").trim();
    if (!title) continue;
    // цена: скидка/уценка приоритетнее базовой
    const disc = it.discount_price, mark = it.markdown_price;
    const hasDisc = disc && disc !== 0 && disc !== "0";
    const hasMark = mark && mark !== 0 && mark !== "0";
    const price = parsePriceSpaced(String(hasDisc ? disc : hasMark ? mark : it.price));
    items.push({
      extId: it.id, title, price, volumeMl: parseVolumeMl(title),
      sourceUrl: it.url?.startsWith("http") ? it.url : `${productBase}${it.url}`,
      discounted: !!(hasDisc || hasMark),
    });
  }
  return { items, currentPage: resp.current_page ?? 0 };
}

// ── telegram (тап-лист разливного бара: t.me/s/<handle>) ──────────────────────
/** Строка похожа на позицию пива (а не промо/заголовок секции): без эмодзи и пунктуации, 1–8 слов. */
export function looksLikeBeerLine(s: string): boolean {
  if (!s) return false;
  if (/\p{Extended_Pictographic}/u.test(s)) return false;
  if (/[.!?:]/.test(s)) return false;
  const words = s.split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= 8;
}
/** Из тап-листов (посты с 📍) достать строки-позиции: всё после первой 📍, кроме локаций (📍…). */
export function parseTelegramTapList(messages: string[]): ShopItem[] {
  const out: ShopItem[] = [];
  for (const post of messages) {
    if (!post.includes("📍")) continue;
    const lines = post.split(/\r?\n/).map((l) => decodeEntities(l));
    const firstPin = lines.findIndex((l) => l.includes("📍"));
    if (firstPin < 0) continue;
    for (const line of lines.slice(firstPin + 1)) {
      if (!line || line.includes("📍")) continue;
      const extId = line.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
      if (!extId) continue;
      out.push({ extId, title: line, format: "draft" });
    }
  }
  return out;
}

// ── taplink (сети баров: taplink.cc/<seller>/p/<id> — тап-лист точки) ─────────
// Контент server-rendered: тап-лист лежит JSON-строкой "text":"…\n1 - …\n2 - …" внутри
// HTML (age-gate — лишь JS-оверлей, на GET не влияет). Строка точки парсибельна regex-ом:
//   «N - Название Стиль Алк. X% Пл. Y% Пивоварня Г. Город ЦЕНА ₽»  (импорт: вместо «Г. Город» — страна)
// Цена — за литр (разлив) → format=draft, volumeMl=1000 (цена за 1000 мл).

/** Достать текстовый блок тап-листа из HTML точки taplink (JSON-строка с нумерованными позициями). */
export function extractTaplinkText(html: string): string | null {
  const re = /"text":"((?:\\.|[^"\\])*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let decoded: string;
    try { decoded = JSON.parse(`"${m[1]}"`); } catch { continue; }
    if (/\n\s*\d+\s*[-—]\s+.+Алк\./.test(decoded)) return decoded;
  }
  return null;
}

const TAPLINK_LINE =
  /^\s*(\d+)\s*[-—]\s+(.+?)\s+Алк\.\s+[\d,]+\s*%\s+Пл\.\s+[\d,]*\s*%?\s+(.+?)\s+(\d+)\s*₽\s*$/u;

/** Тап-лист точки taplink (HTML) → ShopItem[]. title = «Пивоварня Название Стиль» для матчера. */
export function parseTaplinkTapList(html: string): ShopItem[] {
  const text = extractTaplinkText(html);
  if (!text) return [];
  const out: ShopItem[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = decodeEntities(rawLine).replace(/‌/g, "").trim();
    const m = line.match(TAPLINK_LINE);
    if (!m) continue;
    const titlePart = m[2]!.trim();          // название + стиль
    const rest = m[3]!.trim();               // «Пивоварня Г. Город» (РФ) | «Пивоварня … Страна» (импорт)
    const ru = rest.match(/^(.+?)\s+Г\.\s+.+$/);
    const brewery = (ru ? ru[1]! : rest).trim();
    const title = `${brewery} ${titlePart}`.replace(/\s+/g, " ").trim();
    const extId = title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
    if (!extId) continue;
    out.push({ extId, title, price: parseInt(m[4]!, 10), volumeMl: 1000, format: "draft" });
  }
  return out;
}
