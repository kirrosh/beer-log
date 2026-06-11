/**
 * bot-canon.ts — интенты канона (TASK-54, M5). Канон = ось «что маст-трай» (известность как факт).
 *
 * Режимы (по флагам):
 *   --seller <s>   → «что маст-трай ЗДЕСЬ»: канон ∩ пул точки, непробованное вперёд, у пробованного
 *                    вердикт. Главный сценарий у полки (#1).
 *   --brewery <q>  → канон пивоварни (визитки) по всему каталогу, с пометкой наличия (#5).
 *   --style <cat>  → эталоны стиля по всему каталогу, с пометкой наличия (#5).
 *   (без флагов)   → паспорт канона: прогресс по типам и стилям/пивоварням, счётчики пробовано/всего (#2).
 *
 * Выход: компактный JSON. Канон-запись несёт reasons = тип канона + basis (на чём держится).
 */
import { Database } from "bun:sqlite";
import { loadCanon, type CanonEntry, type CanonType } from "./lib/canon.ts";
import { loadPersonal, type Tasting } from "./lib/venue-personal.ts";
import { buildPool } from "./lib/venue-search.ts";
import { buildMatcher } from "./lib/catalog-matcher.ts";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const argv = process.argv.slice(2);
const flag = (n: string): string | undefined => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
};
const seller = flag("seller");
const breweryQ = flag("brewery");
const styleQ = flag("style");

const db = new Database(DB_PATH, { readonly: true });
const { canon } = loadCanon();
const { tastings } = loadPersonal();

// пробовано/вердикт по beerId
const verdictById = new Map<string, Tasting>();
for (const t of tastings) if (t.beerId) verdictById.set(t.beerId, t);

// мета каталога для всех канон-beerId (стиль/пивоварня/abv/обложка/статус)
type Meta = { style: string | null; cat: string | null; breweryId: string | null; brewery: string | null; abv: number | null; image: string | null; status: string };
const canonIds = [...new Set(canon.map((c) => c.beerId).filter(Boolean) as string[])];
const metaById = new Map<string, Meta>();
if (canonIds.length) {
  const rows = db.query(
    `SELECT b.id AS id, b.style_name AS style, b.style_category AS cat, b.brewery_id AS bid,
            br.name AS brewery, b.abv AS abv, b.image_url AS image, b.status AS status
       FROM beers b LEFT JOIN breweries br ON br.id = b.brewery_id
      WHERE b.id IN (${canonIds.map(() => "?").join(",")})`,
  ).all(...canonIds) as { id: string; style: string | null; cat: string | null; bid: string | null; brewery: string | null; abv: number | null; image: string | null; status: string }[];
  for (const r of rows) metaById.set(r.id, { style: r.style, cat: r.cat, breweryId: r.bid, brewery: r.brewery, abv: r.abv, image: r.image, status: r.status });
}

// наличие: число продавцов + минимальная розничная цена по канон-beerId (один запрос)
type Avail = { sellers: number; priceFrom: number | null };
const availById = new Map<string, Avail>();
if (canonIds.length) {
  const rows = db.query(
    `SELECT beer_id AS id, COUNT(DISTINCT seller) AS sellers,
            MIN(CASE WHEN format != 'keg' AND price > 0 THEN price END) AS priceFrom
       FROM price_listings WHERE beer_id IN (${canonIds.map(() => "?").join(",")}) GROUP BY beer_id`,
  ).all(...canonIds) as { id: string; sellers: number; priceFrom: number | null }[];
  for (const r of rows) availById.set(r.id, { sellers: r.sellers, priceFrom: r.priceFrom });
}

const TYPE_RU: Record<CanonType, string> = {
  "brewery-flagship": "визитка пивоварни",
  "style-benchmark": "эталон стиля",
  "ru-classic": "классика рос. крафта",
};
const BASIS_RU: Record<string, string> = {
  distribution: "по дистрибуции",
  checkins: "по чекинам",
  research: "по ресёрчу",
};
// приоритет типов при сортировке выдачи (визитка > эталон > классика — что конкретнее на точке)
const TYPE_RANK: Record<CanonType, number> = { "brewery-flagship": 0, "style-benchmark": 1, "ru-classic": 2 };

const isTasted = (id: string | null): boolean => !!id && verdictById.has(id);
const reasonsFor = (c: CanonEntry): string[] => [`${TYPE_RU[c.canonType]} · ${BASIS_RU[c.basis] ?? c.basis}`, c.basisNote].filter(Boolean);

function enrich(c: CanonEntry) {
  const m = c.beerId ? metaById.get(c.beerId) : undefined;
  const v = c.beerId ? verdictById.get(c.beerId) : undefined;
  const av = c.beerId ? availById.get(c.beerId) : undefined;
  return {
    beerId: c.beerId, beer: c.beer, canonType: c.canonType, basis: c.basis,
    style: m?.style ?? null, abv: m?.abv ?? null, image: m?.image ?? null,
    inCatalog: !!m,
    tasted: isTasted(c.beerId), verdict: v?.verdict ?? null,
    sellers: av?.sellers ?? 0, priceFrom: av?.priceFrom ?? null,
    reasons: reasonsFor(c),
  };
}

// ── режим must-try ЗДЕСЬ ──────────────────────────────────────────────────────
if (seller) {
  const pool = buildPool(db, seller);
  const inPool = new Set(pool.map((p) => p.beerId).filter(Boolean) as string[]);
  const priceById = new Map<string, { price: number | null; format: string }>();
  for (const p of pool) if (p.beerId) priceById.set(p.beerId, { price: p.price, format: p.format });

  const items = canon
    .filter((c) => c.beerId && inPool.has(c.beerId))
    .map((c) => {
      const e = enrich(c);
      const pp = c.beerId ? priceById.get(c.beerId) : undefined;
      return { ...e, price: pp?.price ?? null, format: pp?.format ?? null };
    })
    // непробованное вперёд; внутри — по приоритету типа канона
    .sort((a, b) =>
      Number(a.tasted) - Number(b.tasted) ||
      TYPE_RANK[a.canonType] - TYPE_RANK[b.canonType] ||
      (b.sellers - a.sellers),
    );

  console.log(JSON.stringify({ mode: "must-try", seller, poolSize: pool.length, count: items.length, items }));
  db.close();
  process.exit(0);
}

// ── режим разреза по пивоварне ────────────────────────────────────────────────
if (breweryQ) {
  const m = buildMatcher(db, { createAuto: false }).match(breweryQ);
  const bid = m.breweryId;
  const items = canon
    .filter((c) => c.beerId && bid && metaById.get(c.beerId)?.breweryId === bid)
    .map(enrich)
    .sort((a, b) => Number(a.tasted) - Number(b.tasted) || TYPE_RANK[a.canonType] - TYPE_RANK[b.canonType]);
  console.log(JSON.stringify({ mode: "brewery", brewery: m.breweryName ?? breweryQ, breweryId: bid, count: items.length, items }));
  db.close();
  process.exit(0);
}

// ── режим разреза по стилю (эталоны) ──────────────────────────────────────────
if (styleQ) {
  // все канон-записи этого стиля (эталоны вперёд, затем визитки-этого-стиля); непробованное выше
  const items = canon
    .filter((c) => c.beerId && metaById.get(c.beerId)?.cat === styleQ)
    .map(enrich)
    .sort((a, b) =>
      Number(a.tasted) - Number(b.tasted) ||
      TYPE_RANK[a.canonType] - TYPE_RANK[b.canonType] ||
      (b.sellers - a.sellers),
    );
  console.log(JSON.stringify({ mode: "style", style: styleQ, count: items.length, items }));
  db.close();
  process.exit(0);
}

// ── паспорт канона (прогресс) ─────────────────────────────────────────────────
const breweriesTotal = (db.query("SELECT COUNT(*) c FROM breweries").get() as { c: number }).c;

const byType: Record<string, { total: number; tasted: number }> = {};
for (const c of canon) {
  const k = c.canonType;
  (byType[k] ??= { total: 0, tasted: 0 }).total++;
  if (isTasted(c.beerId)) byType[k]!.tasted++;
}

// разрез эталонов по стилям
const byStyle: Record<string, { total: number; tasted: number }> = {};
for (const c of canon) {
  if (c.canonType !== "style-benchmark" || !c.beerId) continue;
  const cat = metaById.get(c.beerId)?.cat ?? "unknown";
  (byStyle[cat] ??= { total: 0, tasted: 0 }).total++;
  if (isTasted(c.beerId)) byStyle[cat]!.tasted++;
}

const fl = byType["brewery-flagship"] ?? { total: 0, tasted: 0 };
const bm = byType["style-benchmark"] ?? { total: 0, tasted: 0 };
const rc = byType["ru-classic"] ?? { total: 0, tasted: 0 };
// заголовок-паспорт: «RU-классика: 4/23 · эталоны: 2/5 · визитки: 6/266»
const headline = `RU-классика: ${rc.tasted}/${rc.total} · эталоны: ${bm.tasted}/${bm.total} · визитки: ${fl.tasted}/${breweriesTotal}`;

console.log(JSON.stringify({
  mode: "passport",
  total: canon.length,
  headline,
  byType,
  byStyle,
  breweriesTotal, // знаменатель визиток (сколько пивоварен всего в каталоге)
}));
db.close();
