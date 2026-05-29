import { slugify } from "@beer-log/catalog-core";
import type { ParseResult } from "@beer-log/parsers";
import type { DB } from "./db.ts";
import { recordListing, upsertBeer, upsertSource } from "./repo.ts";

/** Положить результат парсинга (сорта + листинги + источник) в каталог. */
export function ingestParseResult(db: DB, r: ParseResult): { beers: number; listings: number } {
  upsertSource(db, {
    id: r.source.id, kind: r.source.kind, handle: r.source.handle,
    url: r.source.url, title: r.source.title, active: r.source.active,
  });

  let beers = 0;
  for (const b of r.beers) {
    if (!b.name) continue;
    const src = b.sources?.[0];
    upsertBeer(db, {
      name: b.name,
      slug: b.slug,
      breweryNameRaw: b.breweryNameRaw,
      style: b.style ? { slug: b.style.slug, name: b.style.name, category: b.style.category } : null,
      abv: b.abv,
      status: b.status ?? "auto",
      source: src ? { url: src.url, excerpt: src.excerpt, seenAt: src.seenAt } : undefined,
    });
    beers++;
  }

  let listings = 0;
  for (const l of r.listings) {
    recordListing(db, {
      id: l.id,
      beerNameRaw: l.beerNameRaw,
      beerSlug: slugify(l.beerNameRaw),
      price: l.price,
      currency: l.currency,
      volumeMl: l.volumeMl,
      format: l.format,
      seller: r.source.handle,
      sourceUrl: l.source?.url,
      seenAt: l.seenAt,
    });
    listings++;
  }
  return { beers, listings };
}
