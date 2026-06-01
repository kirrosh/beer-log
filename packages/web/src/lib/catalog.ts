// Типизированный доступ к снапшоту каталога + вычисление меты.
// Снапшот генерируется scripts/export-catalog.ts из data/catalog.sqlite.
import snapshot from "./data/catalog.json";

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
/** Точка продажи в агрегате пивоварни: продавец + сколько её сортов там встречается. */
export interface BreweryPlace { seller: string; kind: SellerKind; listedBeers: number }
/** Спрос по пивоварне: объединённый охват магазинов, всего листингов, сортов в продаже. */
export interface BreweryDemand { reach: number; listings: number; listedBeers: number; places: BreweryPlace[] }
export interface Brewery {
  slug: string; name: string; city: string | null; country: string;
  segment: string; aliases: string[]; links: Link[]; beerCount: number;
  demand: BreweryDemand | null;
}
export interface Style { slug: string; name: string | null; category: string }
export interface Beer {
  slug: string; name: string; brewerySlug: string | null; breweryName: string | null;
  style: Style | null; abv: number | null; ibu: number | null; status: string;
  description: string | null; sources: string[]; aliases: string[];
  demand: BeerDemand | null;
}

export const generatedAt: string = snapshot.generatedAt;
export const breweries: Brewery[] = snapshot.breweries as Brewery[];
export const beers: Beer[] = snapshot.beers as Beer[];

export const brewBySlug = new Map(breweries.map((b) => [b.slug, b]));

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
