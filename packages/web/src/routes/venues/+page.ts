import type { PageLoad } from "./$types";

// Список точек — живой (из API venue-server), не из статичного снапшота. Поэтому без пререндера
// и client-only (ssr=false): данные точки скоропортящиеся, тянем в браузере.
export const prerender = false;
export const ssr = false;

export const load: PageLoad = async ({ fetch }) => {
  try {
    const res = await fetch("/api/venues");
    if (!res.ok) return { venues: [], offline: true };
    const data = (await res.json()) as { venues: VenueInfo[] };
    return { venues: data.venues, offline: false };
  } catch {
    return { venues: [], offline: true };
  }
};

export type VenueInfo = {
  id: string; seller: string; name: string;
  city: string | null; type: string; source: string; poolSize: number;
};
