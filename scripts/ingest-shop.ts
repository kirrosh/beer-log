// Demand-слой (task-10): листинги магазинов → цены/наличие/скидки в каталог.
// v1 — beerkontora.ru (InSales), идём по коллекциям пивоварен (коллекция = пивоварня →
// дедуп внутри пивоварни чистый). Цены на beerkontora — ОПТОВЫЕ за упаковку (packQty),
// что релевантно нашей B2B-аудитории (бары/боттлшопы). Скидка детектится recordListing
// относительно прошлого снапшота → повторный прогон во времени = сигнал спроса.
//
//   bun run scripts/ingest-shop.ts                 # все пивоварни из карты магазина
//   bun run scripts/ingest-shop.ts afbrew bakunin  # только указанные catalog-slug
//
// Масштабирование (discovery новых пивоварен/сортов): пройти /collection/all с пагинацией
// и вытаскивать пивоварню из заголовка каждого товара — пока не реализовано (см. RUNBOOK).
import { openDb, recordListing, stats } from "@beer-log/store";
import { parseInsalesProducts, shopTitleToBeerName } from "@beer-log/parsers";
import { isSameBeer, slugify } from "@beer-log/catalog-core";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" };
const PAGE_CAP = 8;
const today = new Date().toISOString().slice(0, 10);

const SHOP = {
  id: "beerkontora",
  seller: "beerkontora.ru",
  collectionUrl: (handle: string, page: number) =>
    `https://beerkontora.ru/collection/${handle}${page > 1 ? `?page=${page}` : ""}`,
  // catalog-slug пивоварни → handle коллекции на beerkontora (курируемо; расширять)
  map: {
    "afbrew": "af-brew",
    "4-brewers": "4brewers",
    "bakunin": "bakunin",
    "brewlok": "brewlok",
    "gletcher-brewery": "gletcher",
    "heartly-craft-brewery": "heartly",
    "jaws-brewery": "jaws-brewery",
    "knightberg": "knightberg",
    "konix-brewery": "konix-brewery",
    "odna-tonna": "odna-tonna",
    "plan-b-brewery": "plan-b",
    "rewort-brewery": "rewort",
    "crazy-brew": "crazy-brew",
    "stamm-brewing": "stamm-beer",
  } as Record<string, string>,
};

const only = new Set(process.argv.slice(2));
const targets = Object.entries(SHOP.map).filter(([slug]) => only.size === 0 || only.has(slug));

const db = openDb(DB_PATH);
let totalListings = 0, totalMatched = 0, totalUnlinked = 0, totalDiscount = 0, totalUnavail = 0;

for (const [slug, handle] of targets) {
  const brewery = db.query("SELECT id, name, aliases FROM breweries WHERE slug = ?").get(slug) as
    | { id: string; name: string; aliases: string } | null;
  if (!brewery) { console.log(`! ${slug}: нет в каталоге — пропуск`); continue; }
  const aliases = [brewery.name, ...(JSON.parse(brewery.aliases || "[]") as string[])];
  const beers = db.query("SELECT id, name, slug, aliases FROM beers WHERE brewery_id = ?").all(brewery.id) as
    { id: string; name: string; slug: string; aliases: string }[];

  let listings = 0, matched = 0, unlinked = 0, discounted = 0, unavail = 0;
  for (let page = 1; page <= PAGE_CAP; page++) {
    const url = SHOP.collectionUrl(handle, page);
    const res = await fetch(url, { headers: UA });
    if (!res.ok) break;
    const products = parseInsalesProducts(await res.text());
    if (products.length === 0) break;

    for (const p of products) {
      // канон бывает и рус. (из TG), и англ. (из Untappd) — пробуем ОБЕ половины заголовка
      // "Пиво <рус> / <eng> …", чтобы матч не зависел от алфавита.
      const slash = p.title.lastIndexOf("/");
      const halves = slash >= 0 ? [p.title.slice(slash + 1), p.title.slice(0, slash)] : [p.title];
      const candidates = [...new Set(halves.map((h) => shopTitleToBeerName(h, aliases)).filter((n) => n.length >= 2))];
      if (candidates.length === 0) continue;
      const beerName = candidates[0]!;
      // дедуп внутри пивоварни: имя сорта или его алиасы. Магазин — ВТОРИЧНЫЙ источник:
      // канон не создаём (мусор/кросс-листинги/не-пиво). Совпало → линкуем beerId; нет →
      // листинг с beerId=null (ассортимент/цена сохранены, каталог чист). Промоушн несовпавших
      // в канон — отдельный курируемый/агентный проход.
      const beer = beers.find((b) => {
        const names = [b.name, ...(JSON.parse(b.aliases || "[]") as string[])];
        return candidates.some((c) => names.some((n) => isSameBeer(c, n)));
      });
      if (beer) matched++; else unlinked++; // несвязанные с каноном (beerId=null)

      const r = recordListing(db, {
        id: `bk-${p.productId}-${today}`, // идемпотентно в пределах дня; новый день → новый снапшот
        beerId: beer?.id, beerSlug: beer?.slug ?? slugify(beerName), beerNameRaw: p.title,
        price: p.priceRub ?? undefined, currency: "RUB",
        volumeMl: p.volumeMl ?? undefined, format: p.format,
        seller: SHOP.seller, sourceUrl: `https://beerkontora.ru${p.href}`, seenAt: today,
      });
      listings++;
      if (r.discounted) discounted++;
      if (!p.available) unavail++;
    }
    if (products.length < 12) break; // короткая страница — последняя
  }
  console.log(`${SHOP.id}/${handle} (${slug}): листингов ${listings} | склеено ${matched} | без канона ${unlinked} | скидок ${discounted} | нет в наличии ${unavail}`);
  totalListings += listings; totalMatched += matched; totalUnlinked += unlinked; totalDiscount += discounted; totalUnavail += unavail;
}

console.log(`\nИТОГО ${SHOP.id}: листингов ${totalListings} | склеено с каталогом ${totalMatched} | без канона ${totalUnlinked} | скидок ${totalDiscount} | нет в наличии ${totalUnavail}`);
console.log("STATS:", JSON.stringify(stats(db)));
db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
db.close();
