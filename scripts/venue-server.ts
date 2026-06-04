// Лёгкий локальный API для экрана точки (TASK-34, #1). Переиспользует venue-search/venue-personal
// ВЖИВУЮ на bun:sqlite — данные точки свежие без пересборки JSON-снапшота. Только чтение.
//
//   bun run scripts/venue-server.ts            # → http://localhost:5174
//   GET /api/venues                            # список точек [{id,name,city,type,poolSize}]
//   GET /api/venue/:id                         # пул + личные срезы + статистика
//   GET /api/venue/:id/search?q=Jaws+Атомная   # каскад «найти ту самую» (exact→fuzzy→…→none)
//
// SvelteKit-витрина тянет это через прокси /api (см. packages/web/vite.config.ts). Сервер нужен
// именно потому, что пул/поиск/личное живут в скриптах на SQLite, а не в статичном снапшоте.
import { Database } from "bun:sqlite";
import { buildVenueSearch } from "./lib/venue-search.ts";
import { buildVenuePersonal, type PoolItem } from "./lib/venue-personal.ts";
import { venueIndex, type VenueInfo } from "./lib/venue-registry.ts";

const DB_PATH = process.env.CATALOG_DB ?? "data/catalog.sqlite";
const PORT = Number(process.env.VENUE_API_PORT ?? 5174);

const db = new Database(DB_PATH, { readonly: true });

// индекс точек + slug-карта сортов (для линка пул→карточка /beer/[slug]) строятся один раз:
// каталог статичен между ингестами, сервер живёт один прогон у полки.
const venues = venueIndex(db);
const byId = new Map(venues.map((v) => [v.id, v]));
const beerSlugById = new Map(
  (db.query("SELECT id, slug FROM beers").all() as { id: string; slug: string }[])
    .map((r) => [r.id, r.slug]),
);

// search-построитель тяжеловат (матчер грузит пивоварни) — мемоизируем на seller, поиск
// дёргается на каждый ввод в строку.
const searchCache = new Map<string, ReturnType<typeof buildVenueSearch>>();
function getSearch(seller: string) {
  let s = searchCache.get(seller);
  if (!s) { s = buildVenueSearch(db, seller); searchCache.set(seller, s); }
  return s;
}

/** Добавить beerSlug к позиции пула — чтобы UI линковал на /beer/[slug]. */
const withSlug = (p: PoolItem) => ({ ...p, beerSlug: p.beerId ? beerSlugById.get(p.beerId) ?? null : null });

function venuePayload(v: VenueInfo) {
  const personal = buildVenuePersonal(db, v.seller);
  return {
    venue: v,
    pool: personal.pool.map(withSlug),
    notTasted: personal.notTasted().map(withSlug),
    fromFavorites: personal.fromFavorites().map(withSlug),
    highlights: personal.highlights().map((h) => ({ ...h, item: h.item ? withSlug(h.item) : null })),
    stats: personal.stats,
  };
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean); // ["api","venue",":id","search"]
    if (parts[0] !== "api") return json({ error: "not found" }, 404);

    if (parts[1] === "venues" && parts.length === 2) return json({ venues });

    if (parts[1] === "venue" && parts[2]) {
      const id = decodeURIComponent(parts[2]);
      const v = byId.get(id);
      if (!v) return json({ error: "venue not found", id }, 404);

      if (parts[3] === "search") {
        const q = url.searchParams.get("q") ?? "";
        const vs = getSearch(v.seller);
        return json({ venue: v, ...vs.search(q), poolSize: vs.poolSize });
      }
      if (parts.length === 3) return json(venuePayload(v));
    }
    return json({ error: "not found" }, 404);
  },
});

console.log(`venue-api → http://localhost:${server.port} · ${venues.length} точек · БД ${DB_PATH}`);
