// TASK-32 (B2): естественный запрос «кислое до 500» → структурный фильтр → SQL по пулу точки.
//
// Контракт: разбор фразы — отдельная дешёвая ступень (в боте её делает САМ агент, передавая
// структурные флаги; здесь — детерминированный лексикон-фолбэк, он же делает интент тестируемым).
// Матч сорта по ИМЕНИ — это другой вход (TASK-30, venue-search). Тут фильтруем по СВОЙСТВАМ
// (стиль/ABV/цена/формат) — «помоги выбрать», не «найди ту самую».
import { Database } from "bun:sqlite";

/** Структурный фильтр — схема AC#1. tasteTags принимается, но в SQL пока не маппится (нет источника). */
export type QueryFilter = {
  style?: string;        // beers.style_category: ipa | sour-wild | stout-porter | lager | pale-ale | wheat | belgian | specialty
  abvMin?: number;       // %
  abvMax?: number;       // %
  priceMax?: number;     // ₽
  format?: string[];     // ['can','bottle'] (на вынос) | ['draft','keg'] (на кране) | конкретный
  tasteTags?: string[];  // опц., зарезервировано
};

export type FilterItem = {
  beerId: string | null;
  brewery: string | null;
  beer: string;
  style: string | null;       // style_category
  styleName: string | null;   // человекочитаемый стиль
  abv: number | null;
  price: number | null;
  format: string;
  seenAt: string;
};

export type FilterRun = {
  filter: QueryFilter;
  relaxed: string[];   // какие условия ослаблены ради непустого результата (AC#2 деградация)
  count: number;
  items: FilterItem[];
};

// ── Лексикон RU → структурный фильтр (AC#1, фолбэк-парсер) ───────────────────────
// Порядок важен: специфичное раньше общего; 'гозе' уходит только в sour-wild.
const STYLE_LEX: [RegExp, string][] = [
  [/кисл|кисля|гозе|gose|ламбик|lambic|берлинер|berliner|сауэр|sour|вайлд|wild|фрукт.*кисл/i, "sour-wild"],
  [/стаут|stout|портер|porter|импери|imperial|пастри|pastry|молочн.{0,4}(стаут|шоколад)/i, "stout-porter"],
  [/(?<![а-я])ипа(?![а-я])|\bipa\b|нейпа|neipa|дип[аы]|\bdipa\b|ддх|\bddh\b|india.?pale|хейзи|hazy/i, "ipa"],
  [/лагер|lager|пилс|pils|пильзнер|pilsner|helles|хеллес|мюнхен|бок\b|\bbock/i, "lager"],
  [/пейл.?эл|pale.?ale|(?<![а-я])апа(?![а-я])|\bapa\b|american.?pale/i, "pale-ale"],
  [/пшеничн|wheat|вайцен|weizen|хефе|hefe|witbier|\bвит(?![а-я])|\bвайс/i, "wheat"],
  [/бельг|belgian|дюббель|dubbel|трипель|tripel|квадрюпель|quad|сезон\b|saison|саисон/i, "belgian"],
  [/барлив|barley.?wine|барливайн|спешл|specialty|смузи|smoothie|сидр|cider/i, "specialty"],
];

const FORMAT_PACKAGED = ["can", "bottle"]; // на вынос/домой
const FORMAT_DRAFT = ["draft", "keg"];     // на кране/тут

/** Разобрать естественную фразу в структурный фильтр (детерминированно, без сети). */
export function parseQuery(text: string): QueryFilter {
  const t = ` ${text.toLowerCase().replace(/ё/g, "ё")} `;
  const f: QueryFilter = {};

  for (const [re, cat] of STYLE_LEX) {
    if (re.test(t)) { f.style = cat; break; }
  }

  // ABV — числа с %/град забираем первыми, чтобы не спутать с ценой
  const abvUpTo = t.match(/(?:до|не\s*(?:крепче|выше|больше)|максимум)\s*(\d{1,2}(?:[.,]\d)?)\s*(?:%|град|°)/);
  const abvFrom = t.match(/(?:от|крепче|выше|больше)\s*(\d{1,2}(?:[.,]\d)?)\s*(?:%|град|°)/);
  if (abvUpTo) f.abvMax = num(abvUpTo[1]);
  if (abvFrom) f.abvMin = num(abvFrom[1]);
  // мягкие маркеры крепости (если явных чисел не было)
  if (f.abvMin == null) {
    if (/очень\s*крепк|крепчайш|ядрён|ядрен|забойн|термояд|9\s*град/.test(t)) f.abvMin = 9;
    else if (/крепк|покрепче|позабористее|крепач|поза́бористее|погор[яа]чее/.test(t)) f.abvMin = 7;
  }
  if (f.abvMax == null) {
    if (/лайт|лёгк|легк|лёгонь|сессио|session|слабоалког|некрепк|питк|питейн|не\s*забойн/.test(t)) f.abvMax = 5;
    else if (/не\s*очень|не\s*сильно|не\s*прям|умеренн|средн.{0,4}крепост/.test(t) && f.abvMin != null) f.abvMax = 9;
  }

  // Цена — «до N» с N≥100, либо явные руб-маркеры
  const priceM =
    t.match(/(?:до|дешевле|не\s*дороже|в\s*пределах|максимум|макс\.?|не\s*больше|бюджет\w*)\s*(\d{2,6})\s*(?:р|руб|₽|рубл|деревян)/) ||
    t.match(/(?:до|дешевле|не\s*дороже|в\s*пределах|не\s*больше)\s*(\d{3,6})(?!\s*(?:%|град|°))/);
  if (priceM) f.priceMax = num(priceM[1]);

  // Формат
  if (/на\s*вынос|с\s*собой|домой|в\s*банк|\bбанк|бутыл|упаковк|закрыт/.test(t)) f.format = FORMAT_PACKAGED;
  else if (/на\s*кран|разлив|налив|на\s*месте|выпить\s*тут|тут\s*выпить/.test(t)) f.format = FORMAT_DRAFT;

  return f;
}

// ── SQL по пулу точки + graceful degradation (AC#2) ─────────────────────────────
const RELAX_ORDER = ["format", "price", "abv", "style"] as const; // мягкое → ядро

/** Прогнать фильтр по пулу seller. При пустом результате последовательно ослабляет условия. */
export function runFilter(db: Database, seller: string, filter: QueryFilter, limit = 12): FilterRun {
  const active: QueryFilter = { ...filter, format: filter.format ? [...filter.format] : undefined };
  const relaxed: string[] = [];
  let items = queryPool(db, seller, active, limit);

  for (const k of RELAX_ORDER) {
    if (items.length) break;
    let dropped = false;
    if (k === "format" && active.format) { delete active.format; dropped = true; }
    if (k === "price" && active.priceMax != null) { delete active.priceMax; dropped = true; }
    if (k === "abv" && (active.abvMin != null || active.abvMax != null)) { delete active.abvMin; delete active.abvMax; dropped = true; }
    if (k === "style" && active.style) { delete active.style; dropped = true; }
    if (dropped) { relaxed.push(k); items = queryPool(db, seller, active, limit); }
  }

  return { filter, relaxed, count: items.length, items };
}

function queryPool(db: Database, seller: string, f: QueryFilter, limit: number): FilterItem[] {
  const where: string[] = ["pl.seller = ?"];
  const params: (string | number)[] = [seller];
  // стиль/ABV живут в каталоге → если они в фильтре, листинг должен быть сматчен (beer_id есть)
  const needsCatalog = f.style != null || f.abvMin != null || f.abvMax != null;
  if (needsCatalog) where.push("pl.beer_id IS NOT NULL");
  if (f.style != null) { where.push("b.style_category = ?"); params.push(f.style); }
  if (f.abvMin != null) { where.push("b.abv >= ?"); params.push(f.abvMin); }
  if (f.abvMax != null) { where.push("b.abv <= ?"); params.push(f.abvMax); }
  if (f.priceMax != null) { where.push("pl.price IS NOT NULL AND pl.price <= ?"); params.push(f.priceMax); }
  if (f.format && f.format.length) {
    where.push(`pl.format IN (${f.format.map(() => "?").join(",")})`);
    params.push(...f.format);
  }

  const rows = db.query(`
    SELECT pl.beer_id AS beerId, pl.beer_name_raw AS raw, pl.format AS fmt,
           pl.price AS price, pl.seen_at AS seenAt,
           b.name AS beerName, b.abv AS abv,
           b.style_category AS styleCat, b.style_name AS styleName,
           br.name AS brewName
    FROM price_listings pl
    LEFT JOIN beers b ON b.id = pl.beer_id
    LEFT JOIN breweries br ON br.id = b.brewery_id
    WHERE ${where.join(" AND ")}
  `).all(...params) as {
    beerId: string | null; raw: string; fmt: string | null; price: number | null; seenAt: string;
    beerName: string | null; abv: number | null; styleCat: string | null; styleName: string | null; brewName: string | null;
  }[];

  // дедуп по сорту (или raw для нераспознанных): один представитель, минимальная цена, лучший формат
  const byKey = new Map<string, FilterItem>();
  for (const r of rows) {
    const key = r.beerId ?? `raw:${r.raw.trim().toLowerCase()}`;
    const item: FilterItem = {
      beerId: r.beerId,
      brewery: r.brewName,
      beer: r.beerName ?? r.raw.trim(),
      style: r.styleCat,
      styleName: r.styleName,
      abv: r.abv,
      price: r.price,
      format: r.fmt || "unknown",
      seenAt: r.seenAt,
    };
    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, item); continue; }
    // представитель: дешевле (не-null) важнее, затем лучший формат
    const better =
      (item.price != null && (prev.price == null || item.price < prev.price)) ||
      (item.price === prev.price && formatRank(item.format) < formatRank(prev.format));
    if (better) byKey.set(key, item);
  }

  return [...byKey.values()]
    .sort((a, b) => priceKey(a.price) - priceKey(b.price) || (b.abv ?? 0) - (a.abv ?? 0))
    .slice(0, limit);
}

const FORMAT_RANK: Record<string, number> = { draft: 0, keg: 1, can: 2, bottle: 3 };
const formatRank = (f: string) => FORMAT_RANK[f] ?? 9;
const priceKey = (p: number | null) => (p == null ? Number.MAX_SAFE_INTEGER : p);
const num = (s: string) => Number(s.replace(",", "."));
