// Типизированный доступ к снапшоту каталога + вычисление меты.
// Снапшот генерируется scripts/export-catalog.ts из data/catalog.sqlite.
import snapshot from "./data/catalog.json";

export interface Link { kind: string; url: string; title?: string }
export interface Brewery {
  slug: string; name: string; city: string | null; country: string;
  segment: string; aliases: string[]; links: Link[]; beerCount: number;
}
export interface Style { slug: string; name: string | null; category: string }
export interface Beer {
  slug: string; name: string; brewerySlug: string | null; breweryName: string | null;
  style: Style | null; abv: number | null; ibu: number | null; status: string;
  description: string | null; sources: string[]; aliases: string[];
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
