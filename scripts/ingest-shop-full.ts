// Полный скан beerkontora.ru (task-10/12): прирост каталога росс. крафтом + demand по всему.
// Фаза A — коллекции РОСС. КРАФТ пивоварен (data/discovery/beerkontora-ru-craft.json):
//   пивоварня известна (=коллекция) → апсертим её в канон (новые) + создаём/линкуем сорта
//   (status auto) + листинги. Анти-мусор: сорт создаём ТОЛЬКО если в заголовке есть алиас
//   именно этой пивоварни (≥4 симв.) — отсекает кросс-листинги (чужой бренд в коллекции).
// Фаза B — /collection/all с пагинацией: всё остальное (импорт/мейнстрим) пишем ЛИСТИНГАМИ
//   с beerId=null (demand-сигнал, канон не трогаем). Дедуп по productId (Фаза A уже записала).
//
//   bun run scripts/ingest-shop-full.ts            # обе фазы
//   PHASE=A bun run scripts/ingest-shop-full.ts    # только росс. крафт (быстро)
import { openDb, upsertBrewery, upsertBeer, recordListing, stats } from "@beer-log/store";
import { parseInsalesProducts, shopTitleToBeerName } from "@beer-log/parsers";
import { isSameBeer, slugify } from "@beer-log/catalog-core";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const PHASE = process.env.PHASE ?? "AB";
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" };
const COL_PAGES = 12, ALL_PAGES = 140;
const today = new Date().toISOString().slice(0, 10);
// не-пиво: создавать как СОРТ не будем (но листингом запишем) — тоники/сидр/мёд/комбуча/вода
const NONBEER = /комбуч|kombucha|тоник|tonik|tonic|botanicals|сидр|cider|медовух|\bmead\b|квас|kvas|лимонад|lemonade|\bвода\b|\bwater\b|энергет|\benergy\b/i;

type Ru = { handle: string; catalogSlug: string | null; name: string; city: string | null; aliases: string[] };
const cfg = JSON.parse(await Bun.file("data/discovery/beerkontora-ru-craft.json").text()) as { ruCraft: Ru[] };

const colUrl = (h: string, p: number) => `https://beerkontora.ru/collection/${h}${p > 1 ? `?page=${p}` : ""}`;
const allUrl = (p: number) => `https://beerkontora.ru/collection/all${p > 1 ? `?page=${p}` : ""}`;

async function fetchProducts(url: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (!res.ok) { if (res.status === 404) return []; continue; }
      return parseInsalesProducts(await res.text());
    } catch { /* сеть/ZlibError — повторим */ }
  }
  return null; // 3 неудачи подряд
}
const hasAlias = (title: string, aliases: string[]) => {
  const t = title.toLowerCase();
  return aliases.some((a) => a.length >= 4 && t.includes(a.toLowerCase()));
};

const db = openDb(DB_PATH);
const seen = new Set<number>(); // productId, записанные в этом прогоне
let brewsAdded = 0, beersCreated = 0, linked = 0, listingsRu = 0, listingsImport = 0;

// ---- Фаза A: росс. крафт коллекции ----
if (PHASE.includes("A")) {
  for (const ru of cfg.ruCraft) {
    const slug = ru.catalogSlug ?? slugify(ru.name);
    // пивоварню создаём ЛЕНИВО — только когда у неё реально нашёлся хоть один товар
    // (иначе фетч-фейл/пустая коллекция плодит пустые записи в каноне).
    let breweryId: string | null = null;
    let beers: { id: string; name: string; slug: string; aliases: string }[] = [];
    const ensureBrewery = () => {
      if (breweryId) return breweryId;
      const existed = db.query("SELECT id FROM breweries WHERE slug = ?").get(slug) as { id: string } | null;
      breweryId = upsertBrewery(db, {
        name: ru.name, slug, city: ru.city ?? undefined, country: "RU", segment: "craft", aliases: ru.aliases,
      });
      if (!existed) brewsAdded++;
      beers = db.query("SELECT id, name, slug, aliases FROM beers WHERE brewery_id = ?").all(breweryId) as typeof beers;
      return breweryId;
    };

    let col = 0, made = 0, lnk = 0;
    for (let page = 1; page <= COL_PAGES; page++) {
      const products = await fetchProducts(colUrl(ru.handle, page));
      if (!products || products.length === 0) break;
      for (const p of products) {
        ensureBrewery();
        seen.add(p.productId);
        let beerId: string | undefined, beerSlug: string | undefined;
        // не-пиво (сидр/тоник/комбуча/…) ищем в ИСХОДНОМ заголовке — рус. маркер часто в
        // срезанном префиксе ("Сидр Василеостровский …"). Такое в канон не заводим (но листинг пишем).
        if (hasAlias(p.title, ru.aliases) && !NONBEER.test(p.title)) {
          const sl = p.title.lastIndexOf("/");
          const halves = sl >= 0 ? [p.title.slice(sl + 1), p.title.slice(0, sl)] : [p.title];
          const cands = [...new Set(halves.map((h) => shopTitleToBeerName(h, ru.aliases)).filter((n) => n.length >= 2))];
          if (cands.length) {
            const beer = beers.find((b) => {
              const names = [b.name, ...(JSON.parse(b.aliases || "[]") as string[])];
              return cands.some((c) => names.some((n) => isSameBeer(c, n)));
            });
            if (beer) { beerId = beer.id; beerSlug = beer.slug; lnk++; }
            else {
              beerId = upsertBeer(db, { name: cands[0]!, breweryId, breweryNameRaw: ru.name, status: "auto" });
              beerSlug = slugify(cands[0]!);
              beers.push({ id: beerId, name: cands[0]!, slug: beerSlug, aliases: "[]" });
              made++;
            }
          }
        }
        recordListing(db, {
          id: `bk-${p.productId}-${today}`, beerId, beerSlug: beerSlug ?? slugify(shopTitleToBeerName(p.title)),
          beerNameRaw: p.title, price: p.priceRub ?? undefined, volumeMl: p.volumeMl ?? undefined,
          format: p.format, seller: "beerkontora.ru", sourceUrl: `https://beerkontora.ru${p.href}`, seenAt: today,
        });
        col++;
      }
      if (products.length < 12) break;
    }
    if (col) console.log(`A ${ru.handle}${ru.catalogSlug ? "" : " [НОВАЯ]"}: листингов ${col} | сортов создано ${made} | склеено ${lnk}`);
    beersCreated += made; linked += lnk; listingsRu += col;
  }
}

// ---- Фаза B: /collection/all — импорт/прочее листингами ----
if (PHASE.includes("B")) {
  for (let page = 1; page <= ALL_PAGES; page++) {
    const products = await fetchProducts(allUrl(page));
    if (!products || products.length === 0) break;
    for (const p of products) {
      if (seen.has(p.productId)) continue;
      seen.add(p.productId);
      recordListing(db, {
        id: `bk-${p.productId}-${today}`, beerNameRaw: p.title,
        beerSlug: slugify(shopTitleToBeerName(p.title)),
        price: p.priceRub ?? undefined, volumeMl: p.volumeMl ?? undefined,
        format: p.format, seller: "beerkontora.ru", sourceUrl: `https://beerkontora.ru${p.href}`, seenAt: today,
      });
      listingsImport++;
    }
    if (page % 20 === 0) console.log(`B /collection/all: страница ${page}, импорт-листингов ${listingsImport}`);
    if (products.length < 12) break;
  }
}

console.log(`\nИТОГО: новых пивоварен ${brewsAdded} | сортов создано ${beersCreated} | склеено ${linked} | листингов РФ ${listingsRu} | листингов импорт ${listingsImport}`);
console.log("STATS:", JSON.stringify(stats(db)));
db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
db.close();
