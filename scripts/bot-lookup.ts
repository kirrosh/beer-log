/**
 * bot-lookup.ts — детерминированный лукап для Telegram-бота (beer-concierge).
 *
 * Вход:  bun run scripts/bot-lookup.ts "<название сорта/пивоварни>"
 * Выход: компактный JSON в stdout — канон + линейка вариантов + «где найти» + личный вердикт.
 *
 * Назначение: убрать round-trip'ы агента (PRAGMA/ad-hoc SQL). Агент извлекает названия из
 * запроса/фото и зовёт этот скрипт (параллельно по каждому) → получает сжатые данные → краткий ответ.
 * Матчинг НЕ дублируем — переиспользуем buildMatcher + nameSimilarity (см. memory
 * catalog-matcher-edition-variant-falsematch: канон+линейку отдаём целиком, выбор за агентом).
 */
import { Database } from "bun:sqlite";
import { buildMatcher } from "./lib/catalog-matcher.ts";
import { nameSimilarity } from "@beer-log/catalog-core";
import { venueIndex, HOME_CITY, type VenueInfo } from "./lib/venue-registry.ts";
import { loadPersonal, type Tasting } from "./lib/venue-personal.ts";
import { freshness } from "./lib/provenance.ts";
import { styleValueMedians, valueSignal } from "./lib/value-index.ts";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const query = process.argv.slice(2).join(" ").trim();
if (!query) {
  console.error('usage: bot-lookup.ts "<название сорта или пивоварни>"');
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: true });

type BeerRow = {
  id: string; name: string; slug: string; brewery_id: string | null;
  style_name: string | null; style_category: string | null;
  abv: number | null; ibu: number | null; status: string; image_url: string | null;
};
type BrewRow = { id: string; name: string; slug: string; city: string | null };

// Стоп-слова стиля/тары — не считаются «ядром» названия при сборке линейки.
const STYLE_STOP = new Set([
  "ipa", "apa", "neipa", "dipa", "tipa", "ale", "lager", "stout", "porter", "sour",
  "gose", "saison", "pils", "pilsner", "weizen", "witbier", "berliner", "barrel",
  "red", "black", "white", "brown", "blonde", "amber", "milk", "oat", "dry", "hazy",
  "west", "coast", "new", "england", "double", "triple", "imperial", "brut", "session",
  "fruited", "pastry", "smoothie", "chili", "chile", "infused", "edition", "series",
  "can", "bottle", "draft", "keg", "сорт", "пиво", "beer", "the", "and",
]);

const tokensOf = (name: string): string[] =>
  name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 4 && !STYLE_STOP.has(t));

// Схожесть с учётом двуязычия: имена в каталоге вида "Nuclear Laundry (Атомная Прачечная)",
// а запрос — на одном языке. Сравниваем и с полным именем, и со скобочной частью.
const simTo = (q: string, name: string): number => {
  const paren = name.match(/\(([^)]+)\)/)?.[1];
  return Math.max(nameSimilarity(q, name), paren ? nameSimilarity(q, paren) : 0);
};

const BEER_COLS =
  "id, name, slug, brewery_id, style_name, style_category, abv, ibu, status, image_url";

// 1. Найти сорт/линейку. Сначала beer-first (запрос обычно = название сорта),
// затем — матчер пивоварни (если запрос = пивоварня). buildMatcher.match ищет ПИВОВАРНЮ.
const core = tokensOf(query);
let level: "exact" | "brewery" | "none" = "none";
let brewery: BrewRow | null = null;
let canonical: BeerRow | null = null;
let lineup: BeerRow[] = [];

// beer-first: фильтр по «ядровым» токенам запроса (name + aliases).
// Фильтруем в JS, а не SQL LIKE: SQLite LIKE для кириллицы регистро-зависим
// ('%атомная%' не матчит 'Атомная'), а JS toLowerCase корректен для Unicode.
let candidates: BeerRow[] = [];
if (core.length) {
  const all = db.query(`SELECT ${BEER_COLS}, aliases FROM beers`).all() as (BeerRow & { aliases: string })[];
  candidates = all.filter((b) => {
    const hay = `${b.name} ${b.aliases ?? ""}`.toLowerCase();
    return core.some((t) => hay.includes(t));
  });
}

if (candidates.length) {
  // Канон: лучший по двуязычной схожести; тай-брейк — validated и более короткое (базовое) имя.
  canonical = [...candidates].sort((a, b) =>
    simTo(query, b.name) - simTo(query, a.name) ||
    Number(b.status === "validated") - Number(a.status === "validated") ||
    a.name.length - b.name.length,
  )[0]!;
  level = simTo(query, canonical.name) >= 0.92 ? "exact" : "brewery";

  // Линейка = все сорта пивоварни канона, делящие «ядровый» токен запроса (переживает скобки/язык).
  brewery = db.query("SELECT id, name, slug, city FROM breweries WHERE id = ?").get(canonical.brewery_id) as BrewRow | null;
  const beers = db.query(`SELECT ${BEER_COLS} FROM beers WHERE brewery_id = ?`).all(canonical.brewery_id) as BeerRow[];
  const coreSet = new Set(core);
  lineup = beers
    .filter((b) => b.id === canonical!.id || tokensOf(b.name).some((t) => coreSet.has(t)))
    .sort((a, b) => simTo(query, b.name) - simTo(query, a.name))
    .slice(0, 8);
} else {
  // Fallback: запрос = пивоварня → топ её сортов.
  const m = buildMatcher(db, { createAuto: false }).match(query);
  if (m.breweryId) {
    brewery = db.query("SELECT id, name, slug, city FROM breweries WHERE id = ?").get(m.breweryId) as BrewRow | null;
    lineup = db.query(
      `SELECT ${BEER_COLS} FROM beers WHERE brewery_id = ? AND status = 'validated' ORDER BY name LIMIT 8`,
    ).all(m.breweryId) as BeerRow[];
    level = "brewery";
  }
}

const lineupIds = lineup.map((b) => b.id);

// 2. «Где найти» — листинги по всем сортам линейки, дедуп по точке.
const venues: VenueInfo[] = venueIndex(db);
const venueBySeller = new Map(venues.map((v) => [v.seller, v]));
const sellerKind = (seller: string): "bar" | "shop" =>
  seller.startsWith("t.me/") ? "bar" : (venueBySeller.get(seller)?.type === "bar" ? "bar" : "shop");

type PlRow = { beer_id: string | null; seller: string | null; price: number | null; volume_ml: number | null; format: string | null; seen_at: string };
const listings = lineupIds.length
  ? (db.query(
      `SELECT beer_id, seller, price, volume_ml, format, seen_at FROM price_listings WHERE beer_id IN (${lineupIds.map(() => "?").join(",")})`,
    ).all(...lineupIds) as PlRow[])
  : [];

const bySeller = new Map<string, PlRow[]>();
for (const r of listings) {
  if (!r.seller) continue;
  (bySeller.get(r.seller) ?? bySeller.set(r.seller, []).get(r.seller)!).push(r);
}

const places = [...bySeller.entries()].map(([seller, rows]) => {
  const vi = venueBySeller.get(seller);
  const formats = [...new Set(rows.map((r) => r.format).filter((f): f is string => !!f && f !== "unknown"))];
  // Розничная цена: исключаем кег (опт). Лучшая (минимальная) из оставшихся.
  const retail = rows.filter((r) => r.format !== "keg" && r.price != null).map((r) => r.price!) as number[];
  const city = vi?.city ?? null;
  const seenAt = rows.map((r) => r.seen_at).sort().at(-1) ?? null;
  const fresh = seenAt ? freshness(seenAt) : null;
  return {
    seller,
    name: vi?.name ?? seller,
    city,
    home: city === HOME_CITY,
    kind: sellerKind(seller),
    formats,
    priceFrom: retail.length ? Math.min(...retail) : null,
    seenAt,
    ageDays: fresh?.ageDays ?? null,
    stale: fresh?.stale ?? false,   // ≥180 дн — «возможно неактуально» у полки
  };
}).sort((a, b) =>
  Number(b.home) - Number(a.home) ||                          // домашний город первым
  (a.priceFrom ?? 1e9) - (b.priceFrom ?? 1e9) ||              // дешевле выше
  a.name.localeCompare(b.name, "ru"),
).slice(0, 12);

const retailPriceFrom = places.map((p) => p.priceFrom).filter((p): p is number => p != null);

// 2b. Value-вердикт (#9 «стоит ли брать»): ₽/литр канон-сорта против медианы стиля и против
// других продавцов того же сорта. Считаем по розничным листингам канона (кег=опт исключаем).
const valueMedians = styleValueMedians(db);
const canonRpl = canonical
  ? listings
      .filter((r) => r.beer_id === canonical!.id && r.format !== "keg" && r.price != null && r.price > 0 && r.volume_ml != null && r.volume_ml > 0)
      .map((r) => ({ seller: r.seller, rubPerLitre: Math.round((r.price! * 1000) / r.volume_ml!) }))
      .sort((a, b) => a.rubPerLitre - b.rubPerLitre)
  : [];
// сигнал считаем по самому дешёвому розничному предложению (его и стоит брать)
const bestVolume = canonical
  ? listings.find((r) => r.beer_id === canonical!.id && r.format !== "keg" && r.price != null && r.price > 0 && r.volume_ml != null && r.volume_ml > 0 && Math.round((r.price! * 1000) / r.volume_ml!) === canonRpl[0]?.rubPerLitre)
  : undefined;
const valueVerdict = bestVolume
  ? valueSignal(
      { price: bestVolume.price, volumeMl: bestVolume.volume_ml, category: canonical!.style_category },
      valueMedians,
    )
  : null;
const value = valueVerdict && {
  category: canonical!.style_category,
  rubPerLitre: valueVerdict.rubPerLitre,
  styleMedianPerLitre: valueVerdict.median,
  deviationPct: Math.round(valueVerdict.deviation * 100), // <0 дешевле медианы
  kind: valueVerdict.kind,
  reason: valueVerdict.reason,
  // разброс по другим продавцам того же сорта (₽/литр): есть ли смысл искать дешевле
  sellers: canonRpl.length,
  cheapestPerLitre: canonRpl[0]?.rubPerLitre ?? null,
  dearestPerLitre: canonRpl.at(-1)?.rubPerLitre ?? null,
};

// 3. Личный вердикт — по любому сорту линейки (или близкому имени).
const { tastings } = loadPersonal();
const idSet = new Set(lineupIds);
const verdict: Tasting | null =
  tastings.find((t) => t.beerId && idSet.has(t.beerId)) ||
  (canonical ? tastings.find((t) => nameSimilarity(t.beer, canonical!.name) >= 0.6) : undefined) ||
  null;

// 4. Компактный JSON (без отступов — меньше токенов агенту).
const out = {
  query,
  level,
  brewery: brewery ? { name: brewery.name, slug: brewery.slug, city: brewery.city } : null,
  canonical: canonical && {
    id: canonical.id, name: canonical.name, style: canonical.style_name,
    abv: canonical.abv, ibu: canonical.ibu, status: canonical.status, image: canonical.image_url,
  },
  lineup: lineup.map((b) => ({
    id: b.id, name: b.name, style: b.style_name, abv: b.abv, ibu: b.ibu, image: b.image_url,
  })),
  whereToFind: places,
  retailPriceFrom: retailPriceFrom.length ? Math.min(...retailPriceFrom) : null,
  value,
  verdict: verdict && {
    verdict: verdict.verdict, favorite: verdict.favorite, wouldRepeat: verdict.wouldRepeat,
    venue: verdict.venue, format: verdict.format, descriptors: verdict.descriptors,
  },
};
console.log(JSON.stringify(out));
db.close();
