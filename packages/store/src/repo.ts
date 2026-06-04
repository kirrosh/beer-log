import { slugify } from "@beer-log/catalog-core";
import type { DB } from "./db.ts";

const now = (): string => new Date().toISOString();
const rid = (p: string): string => `${p}_${crypto.randomUUID().slice(0, 8)}`;

/** Офиц. ссылка пивоварни (подмножество SourceRef): сайт/Telegram/VK/Untappd. */
export interface BreweryLink {
  kind: "telegram" | "website" | "vk" | "untappd" | string;
  url: string;
  title?: string;
}

export interface BreweryInput {
  name: string;
  /** явный slug для привязки к существующей записи (иначе slugify(name)) */
  slug?: string;
  city?: string;
  country?: string;
  segment?: "craft" | "mainstream" | "unknown";
  aliases?: string[];
  links?: BreweryLink[];
  /** офиц. логотип — локальный путь рехостнутого файла (task-15) */
  imageUrl?: string;
  /** при апдейте сделать input.name каноническим именем (старое уедет в алиасы) */
  canonicalName?: boolean;
}

/** Слить два набора ссылок по url (без дублей), сохраняя порядок. */
function mergeLinks(prev: BreweryLink[], next: BreweryLink[]): BreweryLink[] {
  const byUrl = new Map<string, BreweryLink>();
  for (const l of [...prev, ...next]) {
    if (!l?.url) continue;
    byUrl.set(l.url, { ...byUrl.get(l.url), ...l });
  }
  return [...byUrl.values()];
}

/** Upsert пивоварни с дедупом по slug; алиасы, ссылки и пропуски сливаются. */
export function upsertBrewery(db: DB, input: BreweryInput): string {
  const slug = input.slug ?? slugify(input.name);
  const existing = db
    .query("SELECT id, name, aliases, links FROM breweries WHERE slug = ?")
    .get(slug) as { id: string; name: string; aliases: string; links: string | null } | null;
  const ts = now();

  if (existing) {
    const aliases = new Set<string>(JSON.parse(existing.aliases || "[]"));
    for (const a of input.aliases ?? []) aliases.add(a);
    // канонизация имени: новое имя — в name, старое — в алиасы
    let name = existing.name;
    if (input.name && input.name !== existing.name) {
      if (input.canonicalName) { name = input.name; aliases.add(existing.name); }
      else aliases.add(input.name);
    }
    aliases.delete(name);
    const links = mergeLinks(JSON.parse(existing.links || "[]"), input.links ?? []);
    db.query(
      `UPDATE breweries SET
         name = ?,
         city = COALESCE(city, ?),
         segment = CASE WHEN segment = 'unknown' THEN ? ELSE segment END,
         aliases = ?, links = ?, image_url = COALESCE(image_url, ?), updated_at = ?
       WHERE id = ?`,
    ).run(
      name, input.city ?? null, input.segment ?? "unknown",
      JSON.stringify([...aliases]), JSON.stringify(links), input.imageUrl ?? null, ts, existing.id,
    );
    return existing.id;
  }

  const id = rid("br");
  db.query(
    `INSERT INTO breweries (id,name,slug,city,country,segment,aliases,links,image_url,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id, input.name, slug, input.city ?? null, input.country ?? "RU",
    input.segment ?? "unknown", JSON.stringify(input.aliases ?? []),
    JSON.stringify(input.links ?? []), input.imageUrl ?? null, ts, ts,
  );
  return id;
}

/** Установить/обновить логотип пивоварни (рехостнутый локальный путь, task-15). */
export function setBreweryImage(db: DB, breweryId: string, imageUrl: string): void {
  db.query("UPDATE breweries SET image_url = ?, updated_at = ? WHERE id = ?").run(imageUrl, now(), breweryId);
}

export interface BeerInput {
  name: string;
  slug?: string;
  breweryId?: string | null;
  breweryNameRaw?: string;
  style?: { slug: string; name: string; category: string } | null;
  abv?: number;
  ibu?: number;
  status?: string;
  aliases?: string[];
  /** офиц. этикетка/банка — локальный путь рехостнутого файла (task-15) */
  imageUrl?: string;
  source?: { url: string; excerpt?: string; seenAt: string };
}

/** Upsert сорта с дедупом по (slug, brewery_id); поля и провенанс сливаются. */
export function upsertBeer(db: DB, b: BeerInput): string {
  const slug = b.slug ?? slugify(b.name);
  const brewKey = b.breweryId ?? "";
  const existing = db
    .query("SELECT id, aliases FROM beers WHERE slug = ? AND COALESCE(brewery_id,'') = ?")
    .get(slug, brewKey) as { id: string; aliases: string } | null;
  const ts = now();
  let id: string;

  if (existing) {
    id = existing.id;
    const aliases = new Set<string>(JSON.parse(existing.aliases || "[]"));
    for (const a of b.aliases ?? []) aliases.add(a);
    db.query(
      `UPDATE beers SET
         style_slug = COALESCE(style_slug, ?),
         style_name = COALESCE(style_name, ?),
         style_category = COALESCE(style_category, ?),
         abv = COALESCE(abv, ?), ibu = COALESCE(ibu, ?),
         brewery_name_raw = COALESCE(brewery_name_raw, ?),
         image_url = COALESCE(image_url, ?),
         aliases = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      b.style?.slug ?? null, b.style?.name ?? null, b.style?.category ?? null,
      b.abv ?? null, b.ibu ?? null, b.breweryNameRaw ?? null, b.imageUrl ?? null,
      JSON.stringify([...aliases]), ts, id,
    );
  } else {
    id = rid("be");
    db.query(
      `INSERT INTO beers
         (id,name,slug,brewery_id,brewery_name_raw,style_slug,style_name,style_category,abv,ibu,status,aliases,image_url,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id, b.name, slug, b.breweryId ?? null, b.breweryNameRaw ?? null,
      b.style?.slug ?? null, b.style?.name ?? null, b.style?.category ?? null,
      b.abv ?? null, b.ibu ?? null, b.status ?? "auto",
      JSON.stringify(b.aliases ?? []), b.imageUrl ?? null, ts, ts,
    );
  }

  if (b.source) {
    db.query(
      "INSERT OR IGNORE INTO beer_sources (beer_id, source_url, excerpt, seen_at) VALUES (?,?,?,?)",
    ).run(id, b.source.url, b.source.excerpt ?? null, b.source.seenAt);
  }
  return id;
}

/** Установить/обновить этикетку сорта (рехостнутый локальный путь, task-15). */
export function setBeerImage(db: DB, beerId: string, imageUrl: string): void {
  db.query("UPDATE beers SET image_url = ?, updated_at = ? WHERE id = ?").run(imageUrl, now(), beerId);
}

export function upsertSource(
  db: DB,
  s: { id: string; kind: string; handle?: string; url?: string; title?: string; active?: boolean },
): void {
  db.query(
    `INSERT INTO sources (id,kind,handle,url,title,active) VALUES (?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, active = excluded.active`,
  ).run(s.id, s.kind, s.handle ?? null, s.url ?? null, s.title ?? null, s.active === false ? 0 : 1);
}

export interface ListingInput {
  id?: string;
  beerId?: string | null;
  beerNameRaw: string;
  beerSlug?: string;
  price?: number;
  currency?: string;
  volumeMl?: number;
  format?: string;
  seller?: string;
  sourceUrl?: string;
  seenAt: string;
  /** провенанс наблюдения: self|web-photo|owner|user|shop-web. См. колонку source_type. */
  sourceType?: string;
}

/** Записать листинг + снапшот цены; детект скидки относительно прошлой цены позиции. */
export function recordListing(
  db: DB,
  l: ListingInput,
): { id: string; discounted: boolean; prevPrice: number | null } {
  // идемпотентность: тот же листинг (детерминированный id) не пишем повторно
  if (l.id) {
    const ex = db
      .query("SELECT discounted, prev_price FROM price_listings WHERE id = ?")
      .get(l.id) as { discounted: number; prev_price: number | null } | null;
    if (ex) return { id: l.id, discounted: !!ex.discounted, prevPrice: ex.prev_price };
  }
  const id = l.id ?? rid("pl");
  const key = `${l.beerSlug ?? slugify(l.beerNameRaw)}|${l.seller ?? ""}|${l.volumeMl ?? ""}`;
  let prevPrice: number | null = null;
  let discounted = false;

  if (typeof l.price === "number") {
    const last = db
      .query("SELECT price FROM price_snapshots WHERE item_key = ? ORDER BY seen_at DESC, id DESC LIMIT 1")
      .get(key) as { price: number } | null;
    if (last && typeof last.price === "number") {
      prevPrice = last.price;
      discounted = l.price < last.price;
    }
    db.query("INSERT INTO price_snapshots (item_key, price, currency, seen_at) VALUES (?,?,?,?)")
      .run(key, l.price, l.currency ?? "RUB", l.seenAt);
  }

  db.query(
    `INSERT INTO price_listings
       (id,beer_id,beer_name_raw,price,currency,volume_ml,format,seller,source_url,seen_at,discounted,prev_price,source_type)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id, l.beerId ?? null, l.beerNameRaw, l.price ?? null, l.currency ?? "RUB",
    l.volumeMl ?? null, l.format ?? null, l.seller ?? null, l.sourceUrl ?? null,
    l.seenAt, discounted ? 1 : 0, prevPrice, l.sourceType ?? null,
  );
  return { id, discounted, prevPrice };
}

export interface Stats {
  breweries: number;
  beers: number;
  listings: number;
  discounted: number;
  sources: number;
}

export function stats(db: DB): Stats {
  const c = (q: string): number => (db.query(q).get() as { c: number }).c;
  return {
    breweries: c("SELECT COUNT(*) c FROM breweries"),
    beers: c("SELECT COUNT(*) c FROM beers"),
    listings: c("SELECT COUNT(*) c FROM price_listings"),
    discounted: c("SELECT COUNT(*) c FROM price_listings WHERE discounted = 1"),
    sources: c("SELECT COUNT(*) c FROM sources"),
  };
}
