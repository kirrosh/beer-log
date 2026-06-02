// Экспорт каталога в JSON-снапшот для витрины (task-11).
// catalog.sqlite → packages/web/src/lib/data/catalog.json. Витрина статична и читает
// этот снапшот (никакой БД в рантайме). Перегенерировать после ingest/seed.
// Запуск: bun run scripts/export-catalog.ts   (env DB_PATH опц.)
import { Database } from "bun:sqlite";
import { sourceChannelOfUrl, type SourceChannel } from "@beer-log/parsers";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const OUT = "packages/web/src/lib/data/catalog.json";

// Опт/дистрибьюторы: их цены — за упаковку, не розница; из ценового диапазона исключаем
// (но в reach/листинги они входят — наличие сорта это всё равно сигнал).
const OPT_SELLERS = new Set(["kraftbeer.ru"]);

// Свежесть наличия (task-25 #3): снапшот старше порога → флаг `stale` на витрине («данные
// могли устареть»). Порог витрины мягче порога перескана (7д): к 14д устаревание явно видно.
const TODAY = new Date().toISOString().slice(0, 10);
const STALE_AFTER_DAYS = 14;
const daysSince = (d?: string | null): number | null => {
  if (!d) return null;
  const ms = Date.parse(TODAY) - Date.parse(d);
  return Number.isNaN(ms) ? null : Math.floor(ms / 86_400_000);
};
const isStale = (seenAt?: string | null): boolean => (daysSince(seenAt) ?? 0) > STALE_AFTER_DAYS;

// Тип продавца для блока «Где найти»: опт (цену не показываем), бар (TG-канал, разлив),
// иначе магазин. Бары публикуют тап-листы в Telegram (seller = t.me/<канал>).
type SellerKind = "shop" | "bar" | "opt";
const sellerKind = (seller: string): SellerKind =>
  OPT_SELLERS.has(seller) ? "opt" : seller.startsWith("t.me/") ? "bar" : "shop";

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
  // Провенанс «подтверждён пивоварней» (task-21): виды офиц. каналов из host beer_sources.
  // Магазины тут не появляются (shop-ингест пишет только в price_listings). Пустой массив ⇒
  // у пивоварни сорт не подтверждён; «в продаже» считается отдельно из demand (ниже).
  const channels = [...new Set(
    srcs.map((s) => sourceChannelOfUrl(s.source_url)).filter((c): c is SourceChannel => !!c),
  )].sort();
  // сигнал спроса (петля, task-10): где в наличии / сколько листингов / есть ли скидка +
  // диапазон РОЗНИЧНЫХ цен. Из «цены» исключаем опт (за упаковку) и кег (30л — не
  // потребительская розница), иначе «от/до» врут. reach = число продавцов (опт входит).
  type PlRow = { seller: string | null; discounted: number; price: number | null; format: string | null; seen_at: string };
  const pl = db.query(
    "SELECT seller, discounted, price, format, seen_at FROM price_listings WHERE beer_id = ?",
  ).all(r.id as string) as PlRow[];
  const isRetailPrice = (x: PlRow) =>
    x.seller != null && sellerKind(x.seller) !== "opt" && x.format !== "keg" && x.price != null && x.price > 0;
  const retailPrices = pl.filter(isRetailPrice).map((x) => x.price as number);
  // разбивка по продавцу для блока «Где найти» (task-20): цена «от», форматы, дата снапшота
  const bySeller = new Map<string, PlRow[]>();
  for (const x of pl) {
    if (!x.seller) continue;
    const arr = bySeller.get(x.seller);
    if (arr) arr.push(x); else bySeller.set(x.seller, [x]);
  }
  const kindOrder: Record<SellerKind, number> = { shop: 0, bar: 1, opt: 2 };
  const places = [...bySeller.entries()]
    .map(([seller, rows]) => {
      const kind = sellerKind(seller);
      const prices = rows.filter(isRetailPrice).map((x) => x.price as number);
      const formats = [...new Set(rows.map((x) => x.format).filter((f): f is string => !!f && f !== "unknown"))];
      return {
        seller, kind,
        minPrice: prices.length ? Math.min(...prices) : null,
        formats,
        discounted: rows.some((x) => x.discounted === 1),
        seenAt: rows.map((x) => x.seen_at).sort().at(-1) as string,
        stale: isStale(rows.map((x) => x.seen_at).sort().at(-1)),
      };
    })
    .sort((a, b) => (kindOrder[a.kind] - kindOrder[b.kind]) || ((a.minPrice ?? Infinity) - (b.minPrice ?? Infinity)));
  const demand = pl.length
    ? {
        listings: pl.length,
        sellers: [...new Set(pl.map((x) => x.seller).filter(Boolean))] as string[],
        reach: new Set(pl.map((x) => x.seller).filter(Boolean)).size,
        discounted: pl.some((x) => x.discounted === 1),
        minPrice: retailPrices.length ? Math.min(...retailPrices) : null,
        maxPrice: retailPrices.length ? Math.max(...retailPrices) : null,
        places,
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
    channels,
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
// агрегат спроса по пивоварне: охват продавцов (объединение + сколько сортов у каждого),
// всего листингов, сортов в продаже
const brewDemand = new Map<string, { shops: Map<string, number>; listings: number; listedBeers: number }>();
for (const b of beers) {
  if (!b.brewerySlug) continue;
  beersByBrewery.set(b.brewerySlug, (beersByBrewery.get(b.brewerySlug) ?? 0) + 1);
  if (!b.demand) continue;
  let agg = brewDemand.get(b.brewerySlug);
  if (!agg) { agg = { shops: new Map(), listings: 0, listedBeers: 0 }; brewDemand.set(b.brewerySlug, agg); }
  for (const s of b.demand.sellers) agg.shops.set(s, (agg.shops.get(s) ?? 0) + 1);
  agg.listings += b.demand.listings;
  agg.listedBeers += 1;
}
const breweriesOut = breweries.map((b) => {
  const agg = brewDemand.get(b.slug);
  return {
    ...b,
    beerCount: beersByBrewery.get(b.slug) ?? 0,
    demand: agg
      ? {
          reach: agg.shops.size,
          listings: agg.listings,
          listedBeers: agg.listedBeers,
          places: [...agg.shops.entries()]
            .map(([seller, listedBeers]) => ({ seller, kind: sellerKind(seller), listedBeers }))
            .sort((a, b) => (b.listedBeers - a.listedBeers) || a.seller.localeCompare(b.seller)),
        }
      : null,
  };
});

const snapshot = {
  generatedAt: new Date().toISOString().slice(0, 10),
  counts: {
    breweries: breweriesOut.length,
    beers: beers.length,
    cities: new Set(breweriesOut.map((b) => b.city).filter(Boolean)).size,
    beersWithDemand: beers.filter((b) => b.demand).length,
    // провенанс (task-21): подтверждён офиц. каналом пивоварни / только в продаже у магазина
    beersVerifiedByBrewery: beers.filter((b) => b.channels.length).length,
    beersShopOnly: beers.filter((b) => b.demand && !b.channels.length).length,
  },
  breweries: breweriesOut,
  beers,
};

await Bun.write(OUT, JSON.stringify(snapshot, null, 2));
console.log(`exported → ${OUT}`);
console.log(`breweries=${snapshot.counts.breweries} beers=${snapshot.counts.beers} cities=${snapshot.counts.cities}`);
db.close();
