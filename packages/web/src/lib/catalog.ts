// Типизированный доступ к снапшоту каталога + вычисление меты.
// Снапшот генерируется scripts/export-catalog.ts из data/catalog.sqlite.
import snapshot from "./data/catalog.json";
import digestJson from "./data/digest.json";

export interface Link { kind: string; url: string; title?: string }
/** Тип точки продажи: магазин / бар (TG-разлив) / опт (цену как розницу не показываем). */
export type SellerKind = "shop" | "bar" | "opt";
/** Точка продажи сорта для блока «Где найти»: продавец, цена «от», форматы, дата снапшота. */
export interface Place {
  seller: string; kind: SellerKind; minPrice: number | null;
  formats: string[]; discounted: boolean; seenAt: string;
}
/** Спрос по сорту: охват магазинов (reach) + листинги + диапазон розничных цен + точки. */
export interface BeerDemand {
  listings: number; sellers: string[]; reach: number; discounted: boolean;
  minPrice: number | null; maxPrice: number | null; places: Place[];
}
/** Точка продажи в агрегате пивоварни: продавец + сколько её сортов там встречается.
 *  listedBeers === null в публичной сборке (per-seller разбивка под гейтом, task-11). */
export interface BreweryPlace { seller: string; kind: SellerKind; listedBeers: number | null }
/** Спрос по пивоварне: объединённый охват магазинов, всего листингов, сортов в продаже. */
export interface BreweryDemand { reach: number; listings: number; listedBeers: number; places: BreweryPlace[] }
export interface Brewery {
  slug: string; name: string; city: string | null; country: string;
  segment: string; aliases: string[]; links: Link[]; beerCount: number;
  /** офиц. логотип — локальный путь рехостнутого файла (task-15) или null */
  imageUrl: string | null;
  demand: BreweryDemand | null;
}
export interface Style { slug: string; name: string | null; category: string }
/** Вид офиц. источника пивоварни (провенанс, task-21). Магазины сюда не входят. */
export type SourceChannel = "untappd" | "telegram" | "vk" | "website";
export interface Beer {
  slug: string; name: string; brewerySlug: string | null; breweryName: string | null;
  style: Style | null; abv: number | null; ibu: number | null; status: string;
  /** офиц. этикетка — локальный путь рехостнутого файла (task-15) или null */
  imageUrl: string | null;
  description: string | null; channels: SourceChannel[]; sources: string[]; aliases: string[];
  demand: BeerDemand | null;
}

export const generatedAt: string = snapshot.generatedAt;
/** Полная (PRIVATE) сборка: per-seller цены/разбивка в снапшоте. false на паблике. */
export const isFull: boolean = (snapshot as { full?: boolean }).full ?? false;
export const breweries: Brewery[] = snapshot.breweries as Brewery[];
export const beers: Beer[] = snapshot.beers as Beer[];

export const brewBySlug = new Map(breweries.map((b) => [b.slug, b]));

// ── Мета-дайджест (task-11): факты детерминированно + LLM-проза, генерит scripts/gen-digest.ts ─
/** Один факт-блок дайджеста (для числовых плашек на /meta). */
export interface DigestStyle { category: string; label: string; count: number; pct: number }
export interface Digest {
  generatedAt: string;
  mode: "prose-file" | "template";
  facts: {
    counts: Record<string, number>;
    styleDist: DigestStyle[];
    topCities: { city: string; count: number }[];
    topBreweries: { name: string; city: string | null; reach: number; listedBeers: number }[];
    topBeers: { name: string; brewery: string | null; reach: number; minPrice: number | null }[];
  };
  prose: string;
}
export const digest: Digest = digestJson as Digest;

export function beersOf(brewerySlug: string): Beer[] {
  return beers.filter((b) => b.brewerySlug === brewerySlug);
}

/** Распределение сортов по категориям стилей (для мета-бара). */
export function styleDistribution(list: Beer[] = beers): { category: string; count: number }[] {
  const m = new Map<string, number>();
  for (const b of list) {
    const c = b.style?.category ?? "unknown";
    m.set(c, (m.get(c) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

/** Список городов с количеством пивоварен (для фильтра/меты). */
export function cities(): { city: string; count: number }[] {
  const m = new Map<string, number>();
  for (const b of breweries) if (b.city) m.set(b.city, (m.get(b.city) ?? 0) + 1);
  return [...m.entries()].map(([city, count]) => ({ city, count })).sort((a, b) => b.count - a.count);
}

export const counts = {
  breweries: breweries.length,
  beers: beers.length,
  cities: new Set(breweries.map((b) => b.city).filter(Boolean)).size,
  styles: new Set(beers.map((b) => b.style?.category).filter(Boolean)).size,
};

// ── Мета / топ по дистрибуции ──────────────────────────────────────────────
// «Популярность» = ширина дистрибуции (в скольких магазинах встречается), не
// потребительский рейтинг. reach (число магазинов) — первичный ключ, листинги — вторичный.
const sellerCount = new Set(beers.flatMap((b) => b.demand?.sellers ?? [])).size;
export const demandMeta = {
  shops: sellerCount,
  beersWithDemand: beers.filter((b) => b.demand).length,
  breweriesWithDemand: breweries.filter((b) => b.demand).length,
};

/** Самые ходовые сорта: сначала по охвату магазинов, затем по числу листингов. */
export function topBeersByReach(limit = 40): Beer[] {
  return beers
    .filter((b) => b.demand && b.brewerySlug)
    .sort((a, b) => (b.demand!.reach - a.demand!.reach) || (b.demand!.listings - a.demand!.listings)
      || a.name.localeCompare(b.name, "ru"))
    .slice(0, limit);
}

/** Самые представленные пивоварни: по охвату магазинов, затем по числу сортов в продаже. */
export function topBreweriesByReach(limit = 24): Brewery[] {
  return breweries
    .filter((b) => b.demand)
    .sort((a, b) => (b.demand!.reach - a.demand!.reach) || (b.demand!.listedBeers - a.demand!.listedBeers)
      || a.name.localeCompare(b.name, "ru"))
    .slice(0, limit);
}

/** Сейчас со скидкой — по охвату, затем по цене. */
export function dealsBeers(limit = 40): Beer[] {
  return beers
    .filter((b) => b.demand?.discounted && b.brewerySlug)
    .sort((a, b) => (b.demand!.reach - a.demand!.reach) || ((a.demand!.minPrice ?? 1e9) - (b.demand!.minPrice ?? 1e9)))
    .slice(0, limit);
}

// ── Презентация (блок «Где найти», переиспользуется карточками) ─────────────
export const fmtPrice = (n: number | null): string => (n == null ? "—" : `${n.toLocaleString("ru")} ₽`);

/** Плюрализация рус. существительных: plur(n, "магазин", "магазина", "магазинов"). */
export function plur(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

/** Человекочитаемое имя продавца: t.me/<канал> → @<канал>, домен — как есть. */
export const sellerLabel = (seller: string): string =>
  seller.startsWith("t.me/") ? "@" + seller.slice("t.me/".length) : seller.replace(/^www\./, "");

/** Ссылка на источник продавца (сайт магазина / TG-канал бара). Не «купи здесь», а провенанс. */
export const sellerUrl = (seller: string): string =>
  seller.startsWith("http") ? seller : `https://${seller}`;

export const SELLER_KIND_LABEL: Record<SellerKind, string> = { shop: "магазин", bar: "бар", opt: "опт" };

/** Метка формата: bottle→бутылка, can→банка, keg→кег, draft→разлив. */
export const formatLabel = (f: string): string =>
  (({ bottle: "бутылка", can: "банка", keg: "кег", draft: "разлив" }) as Record<string, string>)[f] ?? f;

// ── Провенанс сорта (task-21): два независимых рыночных сигнала ──────────────
// Не рейтинги — наблюдаемые факты (рамка vault/strategy/legal-boundary.md).
/** Человекочитаемое имя офиц. канала пивоварни. */
export const CHANNEL_LABEL: Record<SourceChannel, string> = {
  untappd: "Untappd", telegram: "Telegram", website: "сайт", vk: "VK",
};
/** «✓ варит пивоварня» подтверждён — есть офиц. источник в beer_sources. */
export const verifiedByBrewery = (b: Beer): boolean => b.channels.length > 0;
/** «в продаже» — встречается у продавцов (demand из task-20). */
export const inShops = (b: Beer): boolean => !!b.demand;

/**
 * Комбинированная уверенность записи:
 *  both    — варится И в продаже (полный профиль, самый ценный сорт);
 *  brewery — подтверждён пивоварней, в продаже пока не найден;
 *  shop    — в продаже, но у пивоварни НЕ подтверждён (рабочая очередь прохода по каналам);
 *  none    — ни одного сигнала.
 */
export type Confidence = "both" | "brewery" | "shop" | "none";
export function beerConfidence(b: Beer): Confidence {
  const v = verifiedByBrewery(b), s = inShops(b);
  return v && s ? "both" : v ? "brewery" : s ? "shop" : "none";
}

// ── Многоканальный провенанс (task-26): уровень подтверждённости ──────────────
// «Канал» = вид офиц. источника пивоварни (host beer_sources). Независимость = разные
// виды (untappd≠telegram≠vk≠website), не разные URL одного вида. Чем больше независимых
// каналов сошлось на сорте — тем надёжнее запись. ≥2 = cross-source канон (самый надёжный).
/** Порядок отображения каналов (стабильный, от структурного к вспомогательному). */
export const CHANNEL_ORDER: SourceChannel[] = ["untappd", "telegram", "vk", "website"];
/** Каналы сорта в стабильном порядке. */
export const orderedChannels = (b: Beer): SourceChannel[] =>
  b.channels.slice().sort((a, c) => CHANNEL_ORDER.indexOf(a) - CHANNEL_ORDER.indexOf(c));
/** Уровень подтверждённости = число независимых офиц. каналов сорта. */
export const confirmationLevel = (b: Beer): number => b.channels.length;
/** Cross-source канон — подтверждён ≥2 независимыми каналами (высший класс доверия). */
export const isCrossConfirmed = (b: Beer): boolean => b.channels.length >= 2;
/** Каналы сорта человекочитаемо в стабильном порядке: «Untappd · Telegram». */
export const channelLabels = (b: Beer): string => orderedChannels(b).map((c) => CHANNEL_LABEL[c]).join(" · ");

// ── Изображения (task-15): рехостнутые логотипы/этикетки + фоллбэк-монограмма ──
/** Инициалы для фоллбэк-плашки, когда офиц. изображения нет: 1–2 буквы из имени. */
export function monogram(name: string): string {
  const words = name.trim().split(/[\s·—-]+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}
/** Детерминированный оттенок фоллбэк-плашки по имени (стабилен между сборками). */
export function tintHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}
