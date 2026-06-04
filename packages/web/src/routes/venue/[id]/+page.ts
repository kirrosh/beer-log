import { error } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

// Экран точки — живые данные (пул + личные срезы) из API venue-server. Client-only: данные
// о наличии скоропортящиеся, тянем в браузере, не пререндерим в снапшот.
export const prerender = false;
export const ssr = false;

export const load: PageLoad = async ({ params, fetch }) => {
  let res: Response;
  try {
    res = await fetch(`/api/venue/${encodeURIComponent(params.id)}`);
  } catch {
    throw error(503, "API точек недоступен — запусти `bun run venue:api`");
  }
  if (res.status === 404) throw error(404, "Точка не найдена");
  if (!res.ok) throw error(res.status, "Не удалось загрузить точку");
  return (await res.json()) as VenuePayload;
};

export type PoolItem = {
  beerId: string | null; beerSlug: string | null; rawTitle: string;
  breweryId: string | null; breweryName: string | null;
  beerName: string; beerNameNorm: string; format: string;
  styleSlug: string | null; styleCategory: string | null;
  price: number | null; sourceType: string | null; seenAt: string;
};
export type HighlightItem = {
  venue: string; beerId: string | null; beer: string; badge: string;
  reason: string; inPool: boolean; item: PoolItem | null;
};
export type VenuePayload = {
  venue: { id: string; seller: string; name: string; city: string | null; type: string; source: string; poolSize: number };
  pool: PoolItem[];
  notTasted: PoolItem[];
  fromFavorites: PoolItem[];
  highlights: HighlightItem[];
  stats: { tastedHere: number; favoriteBreweries: number };
};

export type SearchResult = {
  query: string;
  level: "exact" | "fuzzy" | "brewery" | "absent" | "none";
  candidates: { beerId: string | null; beerName: string; breweryName: string | null; format: string; score: number }[];
  poolSize: number;
};
