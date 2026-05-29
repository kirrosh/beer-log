// Обобщённый конвейер обогащения (шаблон скилла craft-enrich).
// Вход: релизы из TG-канала пивоварни + листинги магазинов + ручные алиасы.
// Выход: обогащённые записи (характеристики из первоисточника + цены + теги/ссылки),
// запись в store и/или JSON. Адаптируй под конкретную пивоварню/магазины.
//
// Запуск: bun run skills/craft-enrich/scripts/enrich.ts  (из корня репо beer-log)
import { openDb, upsertBrewery, upsertBeer, recordListing, stats } from "@beer-log/store";
import { categorizeStyle, isSameBeer } from "@beer-log/catalog-core";
// Для разбора реальных TG-постов: import { parseBreweryReleases } from "@beer-log/parsers";

export interface Release {
  name: string;
  styleRaw: string;
  abv?: number;
  plato?: number;
  ibu?: number;
  description: string;
  /** ссылка на конкретный TG-пост (провенанс характеристик) */
  postUrl: string;
  /** кураторские теги (стиль + ноты + бренд/город) */
  tags: string[];
}

export interface ShopListing {
  name: string;
  shop: string;
  price: number;
  volumeMl?: number;
  stock?: number;
}

export interface EnrichOptions {
  brewery: string;
  city?: string;
  breweryLinks: string[]; // сайт, TG, VK, Untappd
  /** ручные алиасы для случаев, где fuzzy не ловит (искажённый транслит) */
  aliases?: Record<string, string[]>;
}

export interface EnrichedBeer {
  name: string;
  brewery: string;
  city?: string;
  style: string;
  category: string;
  abv?: number;
  plato?: number;
  ibu: number | null;
  description: string;
  tags: string[];
  links: string[];
  prices: { shop: string; price: number; volumeMl?: number; stock?: number }[];
  priceMin: number | null;
  priceMax: number | null;
  aliases: string[];
  status: "validated" | "auto";
  provenance: { source: string; post: string };
}

/** Сопоставление сорта с листингами магазинов: fuzzy + ручные алиасы. */
export function matchListings(
  name: string,
  listings: ShopListing[],
  aliases: string[] = [],
): ShopListing[] {
  return listings.filter(
    (l) => isSameBeer(name, l.name) || aliases.some((a) => isSameBeer(a, l.name)),
  );
}

export function enrich(
  releases: Release[],
  listings: ShopListing[],
  opts: EnrichOptions,
): EnrichedBeer[] {
  return releases.map((r) => {
    const st = categorizeStyle(r.styleRaw);
    const al = opts.aliases?.[r.name] ?? [];
    const matched = matchListings(r.name, listings, al);
    const prices = matched.map((m) => ({ shop: m.shop, price: m.price, volumeMl: m.volumeMl, stock: m.stock }));
    return {
      name: r.name,
      brewery: opts.brewery,
      city: opts.city,
      style: r.styleRaw,
      category: st.category,
      abv: r.abv,
      plato: r.plato,
      ibu: r.ibu ?? null,
      description: r.description,
      tags: r.tags,
      links: [...opts.breweryLinks, r.postUrl, ...matched.map((m) => `https://${m.shop}`)],
      prices,
      priceMin: prices.length ? Math.min(...prices.map((p) => p.price)) : null,
      priceMax: prices.length ? Math.max(...prices.map((p) => p.price)) : null,
      aliases: al,
      status: "validated", // характеристики из официального канала пивоварни
      provenance: { source: opts.brewery, post: r.postUrl },
    };
  });
}

/** Записать обогащённые сорта в каталог (store). Возвращает статистику. */
export function persist(dbPath: string, brewery: EnrichOptions, beers: EnrichedBeer[]) {
  const db = openDb(dbPath);
  const seenAt = new Date().toISOString();
  const brewId = upsertBrewery(db, { name: brewery.brewery, city: brewery.city, segment: "craft", country: "RU" });
  for (const b of beers) {
    upsertBeer(db, {
      name: b.name, breweryId: brewId, breweryNameRaw: b.brewery,
      abv: b.abv, ibu: b.ibu ?? undefined, status: b.status,
      style: { slug: categorizeStyle(b.style).slug, name: b.style, category: b.category },
      aliases: b.aliases,
      source: { url: b.provenance.post, excerpt: b.description, seenAt },
    });
    for (const p of b.prices) {
      recordListing(db, { beerNameRaw: b.name, price: p.price, currency: "RUB",
        volumeMl: p.volumeMl, format: "can", seller: p.shop, sourceUrl: `https://${p.shop}`, seenAt });
    }
  }
  const s = stats(db);
  db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
  db.close();
  return s;
}

// Пример использования см. scripts/enrich-rewort.ts в репозитории.
