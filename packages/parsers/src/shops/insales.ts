// Парсер витрин на платформе InSales (server-rendered каталог: карточка = <form> с
// data-product-id, .product-preview__title, .product-preview__price-cur, .product-preview__available).
// Достаёт листинги магазина (имя, цена, наличие, объём, формат) — слой Demand (task-10).
// Чистая функция parseInsalesProducts (без сети) — основа теста/самопроверки разметки.

export type ShopFormat = "can" | "bottle" | "keg" | "draft" | "unknown";

export interface InsalesProduct {
  /** data-product-id */
  productId: number;
  /** полный заголовок карточки (рус / eng + объём + формат) */
  title: string;
  /** относительный путь /product/<handle> */
  href: string;
  /** цена в рублях (на beerkontora — за упаковку; см. packQty) или null */
  priceRub: number | null;
  available: boolean;
  /** объём одной единицы в мл (из заголовка/handle) или null */
  volumeMl: number | null;
  format: ShopFormat;
  /** штук в упаковке (из handle …-Nsht), если указано */
  packQty: number | null;
}

// NB: \b в JS опирается на ASCII \w и НЕ матчит кириллицу — для рус. слов без \b.
const FORMAT_WORDS: [RegExp, ShopFormat][] = [
  [/банк[аи]|ж[\/ ]?б|\bcan\b/i, "can"],
  [/стекло|бутылк[аи]|\bsteklo\b|\bbottle\b/i, "bottle"],
  [/кег[аи]?|\bkeg\b/i, "keg"],
  [/разлив|\bdraft\b|\bdraught\b/i, "draft"],
];

function clean(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePrice(block: string): number | null {
  // берём первую .product-preview__price-* с непустым числом перед ₽ (пустые споны
  // data-product-card-price-from-cart догружаются JS — их пропускаем)
  for (const m of block.matchAll(/product-preview__price[^>]*>([\s\S]*?)<\/(?:div|span)>/g)) {
    const t = clean(m[1] ?? "");
    const d = /(\d[\d  ]*)\s*₽/.exec(t);
    if (d) {
      const n = Number(d[1]!.replace(/[  ]/g, ""));
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

function parseFormat(title: string, href: string): ShopFormat {
  for (const [re, f] of FORMAT_WORDS) if (re.test(title) || re.test(href)) return f;
  return "unknown";
}

function parseVolumeMl(title: string, href: string): number | null {
  // в заголовке: "… 0.33 - банка" / "0,5 л"; в handle: "…-033-l-…" / "…-05-l-…"
  const dec = /(\d+[.,]\d+)\s*(?:л|l)?\b/.exec(title);
  if (dec) {
    const v = Number(dec[1]!.replace(",", "."));
    if (v > 0 && v < 10) return Math.round(v * 1000);
  }
  const h = /-(\d{2,4})-l-/.exec(href); // 033-l → 0.33л
  if (h) {
    const raw = h[1]!;
    const v = Number("0." + raw); // 033 → 0.33
    if (v > 0 && v < 10) return Math.round(v * 1000);
  }
  return null;
}

const SKIP = /\b(бокал|набор|подарочн|мерч|футболк|стакан|открывалк|подстав|bokal|nabor|merch|glass|tshirt)/i;

/** Парсит HTML страницы коллекции/каталога InSales → листинги. */
export function parseInsalesProducts(html: string): InsalesProduct[] {
  const out: InsalesProduct[] = [];
  // карточка = <form … data-product-id="…"> … </form>; режем по началу формы товара
  const parts = html.split(/(?=<form\b[^>]*\sdata-product-id=")/);
  for (const blk of parts) {
    const idM = /^<form\b[^>]*\sdata-product-id="(\d+)"/.exec(blk);
    if (!idM) continue;
    const titleM = /product-preview__title[^>]*>([\s\S]*?)<\/a>/.exec(blk)
      ?? /product-preview__title[^>]*>([\s\S]*?)<\//.exec(blk);
    const hrefM = /href="(\/product\/[^"]+)"/.exec(blk);
    if (!titleM || !hrefM) continue;
    const title = clean(titleM[1] ?? "");
    const href = hrefM[1]!;
    if (!title || SKIP.test(title) || SKIP.test(href)) continue;
    // наличие: явные классы-состояния формы (InSales) или текст
    const available = !/is-all-variants-not-available|is-zero-count(?!-hidden)/.test(blk);
    const packM = /-(\d+)-?sht\b/.exec(href);
    out.push({
      productId: Number(idM[1]),
      title,
      href,
      priceRub: parsePrice(blk),
      available,
      volumeMl: parseVolumeMl(title, href),
      format: parseFormat(title, href),
      packQty: packM ? Number(packM[1]) : null,
    });
  }
  return out;
}

/**
 * Очищает имя сорта из заголовка магазина для сопоставления с каталогом:
 * берёт английскую часть (после "/"), срезает префикс-пивоварню, объём и формат.
 */
export function shopTitleToBeerName(title: string, breweryAliases: string[] = []): string {
  let s = title;
  // "Пиво Х / Eng Name 0.33 - банка" → предпочитаем часть после "/"
  const slash = s.lastIndexOf("/");
  if (slash >= 0) s = s.slice(slash + 1);
  s = s
    .replace(/^\s*(пиво|сидр|мед|медовуха|напиток)\s+/i, "")
    .replace(/\d+[.,]\d+\s*(?:л|l)?\b.*$/i, " ") // объём и всё после
    .replace(/[-–—].*$/, " ") // "- банка"
    .trim();
  for (const a of breweryAliases) {
    if (!a) continue;
    const re = new RegExp("^\\s*" + a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+", "i");
    s = s.replace(re, "");
  }
  return clean(s);
}
