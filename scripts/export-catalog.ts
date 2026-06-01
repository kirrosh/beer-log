// Экспорт каталога в JSON-снапшот для витрины (task-11).
// catalog.sqlite → packages/web/src/lib/data/catalog.json. Витрина статична и читает
// этот снапшот (никакой БД в рантайме). Перегенерировать после ingest/seed.
// Запуск: bun run scripts/export-catalog.ts   (env DB_PATH опц.)
import { Database } from "bun:sqlite";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const OUT = "packages/web/src/lib/data/catalog.json";

// Опт/дистрибьюторы: их цены — за упаковку, не розница; из ценового диапазона исключаем
// (но в reach/листинги они входят — наличие сорта это всё равно сигнал).
const OPT_SELLERS = new Set(["kraftbeer.ru"]);

// read-only: экспортёр только читает, не трогаем заголовок/журнал БД
const db = new Database(DB_PATH, { readonly: true });

type LinkRow = { kind: string; url: string; title?: string };

const breweries = (db.query(
  "SELECT id, name, slug, city, country, segment, aliases, links FROM breweries ORDER BY name",
).all() as Record<string, string>[]).map((r) => ({
  slug: r.slug,
  name: r.name,
  city: r.city ?? null,
  country: r.country ?? "RU",
  segment: r.segment ?? "unknown",
  aliases: JSON.parse(r.aliases || "[]") as string[],
  links: JSON.parse(r.links || "[]") as LinkRow[],
}));
const brewerySlugById = new Map(
  (db.query("SELECT id, slug FROM breweries").all() as { id: string; slug: string }[]).map((r) => [r.id, r.slug]),
);

// описание + источники сорта берём из beer_sources (провенанс); описание — самый длинный excerpt
type SrcRow = { excerpt: string | null; source_url: string };
const beersAll = (db.query(
  `SELECT id, name, slug, brewery_id, brewery_name_raw, style_slug, style_name, style_category,
          abv, ibu, status, aliases
   FROM beers ORDER BY name`,
).all() as Record<string, unknown>[]).map((r) => {
  const srcs = db.query("SELECT excerpt, source_url FROM beer_sources WHERE beer_id = ?")
    .all(r.id as string) as SrcRow[];
  const description = srcs
    .map((s) => s.excerpt)
    .filter((e): e is string => !!e)
    .sort((a, b) => b.length - a.length)[0] ?? null;
  // сигнал спроса (петля, task-10): где в наличии / сколько листингов / есть ли скидка +
  // диапазон РОЗНИЧНЫХ цен. Опт-продавцов (за упаковку) из цены исключаем — мешать опт и
  // розницу в одну «цену от» некорректно (детали в price_listings). reach = число магазинов.
  const pl = db.query(
    "SELECT seller, discounted, price FROM price_listings WHERE beer_id = ?",
  ).all(r.id as string) as { seller: string | null; discounted: number; price: number | null }[];
  const retailPrices = pl
    .filter((x) => x.seller && !OPT_SELLERS.has(x.seller) && x.price != null && x.price > 0)
    .map((x) => x.price as number);
  const demand = pl.length
    ? {
        listings: pl.length,
        sellers: [...new Set(pl.map((x) => x.seller).filter(Boolean))] as string[],
        reach: new Set(pl.map((x) => x.seller).filter(Boolean)).size,
        discounted: pl.some((x) => x.discounted === 1),
        minPrice: retailPrices.length ? Math.min(...retailPrices) : null,
        maxPrice: retailPrices.length ? Math.max(...retailPrices) : null,
      }
    : null;
  return {
    slug: r.slug as string,
    name: r.name as string,
    brewerySlug: r.brewery_id ? (brewerySlugById.get(r.brewery_id as string) ?? null) : null,
    breweryName: (r.brewery_name_raw as string) ?? null,
    style: r.style_slug
      ? { slug: r.style_slug as string, name: (r.style_name as string) ?? null, category: (r.style_category as string) ?? "unknown" }
      : null,
    abv: (r.abv as number) ?? null,
    ibu: (r.ibu as number) ?? null,
    status: (r.status as string) ?? "auto",
    description,
    sources: [...new Set(srcs.map((s) => s.source_url))],
    aliases: JSON.parse((r.aliases as string) || "[]") as string[],
    demand,
  };
});

// Отсев мусорных авто-сортов: пустой slug или имя ≤1 значащего символа (артефакты парсинга
// заголовков магазинов, напр. name="),"). В витрину/топ не пускаем (ссылка /beer/<пусто> ещё
// и ломает пререндер). Чистка канона в БД — отдельной курацией.
const beers = beersAll.filter((b) => b.slug && b.slug.trim() && b.name.replace(/[^\p{L}\p{N}]/gu, "").length >= 2);
const droppedJunk = beersAll.length - beers.length;
if (droppedJunk) console.log(`отсеяно мусорных сортов (пустой slug/имя): ${droppedJunk}`);

// число сортов на пивоварню + агрегат дистрибуции (для меты/топа)
const beersByBrewery = new Map<string, number>();
// агрегат спроса по пивоварне: охват магазинов (объединение), всего листингов, сортов в продаже
const brewDemand = new Map<string, { shops: Set<string>; listings: number; listedBeers: number }>();
for (const b of beers) {
  if (!b.brewerySlug) continue;
  beersByBrewery.set(b.brewerySlug, (beersByBrewery.get(b.brewerySlug) ?? 0) + 1);
  if (!b.demand) continue;
  let agg = brewDemand.get(b.brewerySlug);
  if (!agg) { agg = { shops: new Set(), listings: 0, listedBeers: 0 }; brewDemand.set(b.brewerySlug, agg); }
  for (const s of b.demand.sellers) agg.shops.add(s);
  agg.listings += b.demand.listings;
  agg.listedBeers += 1;
}
const breweriesOut = breweries.map((b) => {
  const agg = brewDemand.get(b.slug);
  return {
    ...b,
    beerCount: beersByBrewery.get(b.slug) ?? 0,
    demand: agg ? { reach: agg.shops.size, listings: agg.listings, listedBeers: agg.listedBeers } : null,
  };
});

const snapshot = {
  generatedAt: new Date().toISOString().slice(0, 10),
  counts: {
    breweries: breweriesOut.length,
    beers: beers.length,
    cities: new Set(breweriesOut.map((b) => b.city).filter(Boolean)).size,
    beersWithDemand: beers.filter((b) => b.demand).length,
  },
  breweries: breweriesOut,
  beers,
};

await Bun.write(OUT, JSON.stringify(snapshot, null, 2));
console.log(`exported → ${OUT}`);
console.log(`breweries=${snapshot.counts.breweries} beers=${snapshot.counts.beers} cities=${snapshot.counts.cities}`);
db.close();
