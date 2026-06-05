/**
 * bot-profile.ts — детерминированный профиль вкуса для Telegram-бота (beer-concierge).
 *
 * Вход:  bun run scripts/bot-profile.ts [--venue <seller|подстрока>] [--style <category>]
 * Выход: компактный JSON в stdout — агрегат поверх data/personal/tastings.json.
 *
 * Назначение (TASK-48, интенты #8/#15): отдать накопленный личный слой обратно у полки —
 * «что я пил», «мои огоньки», «что брал на Гагарина», и питать «зайдёт ли мне X» (#9).
 * Read-only: только читает tastings.json (через loadPersonal) + каталог (для стиля/ABV по beerId).
 * Матчинг/запись НЕ дублируем — стиль берём из БД по beerId, фолбэк — категория из имени.
 */
import { Database } from "bun:sqlite";
import { loadPersonal, type Tasting } from "./lib/venue-personal.ts";
import { categorizeStyle } from "@beer-log/catalog-core";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";

// ── флаги ───────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
};
const venueFilter = flag("venue")?.toLowerCase();
const styleFilter = flag("style")?.toLowerCase();

// ── данные ──────────────────────────────────────────────────────────────────────
const db = new Database(DB_PATH, { readonly: true });
const { tastings } = loadPersonal();

// стиль/ABV по beerId из каталога (одним запросом), фолбэк — категория из имени дегустации.
type BeerMeta = { style: string | null; category: string; abv: number | null };
const metaById = new Map<string, BeerMeta>();
const ids = [...new Set(tastings.map((t) => t.beerId).filter(Boolean) as string[])];
if (ids.length) {
  const rows = db.query(
    `SELECT id, style_name, style_category, abv FROM beers WHERE id IN (${ids.map(() => "?").join(",")})`,
  ).all(...ids) as { id: string; style_name: string | null; style_category: string | null; abv: number | null }[];
  for (const r of rows) {
    metaById.set(r.id, { style: r.style_name, category: r.style_category ?? "unknown", abv: r.abv });
  }
}
db.close();

const metaOf = (t: Tasting): BeerMeta => {
  if (t.beerId && metaById.has(t.beerId)) return metaById.get(t.beerId)!;
  const c = categorizeStyle(t.beer ?? "");
  return { style: c.category, category: c.category, abv: null };
};

// ── фильтры (#15: разрез по точке; опц. по стилю) ─────────────────────────────────
let scope = tastings;
if (venueFilter) scope = scope.filter((t) => (t.venue ?? "").toLowerCase().includes(venueFilter));
if (styleFilter) scope = scope.filter((t) => metaOf(t).category.toLowerCase() === styleFilter);

// ── агрегаты ──────────────────────────────────────────────────────────────────────
const verdicts = { fire: 0, good: 0, pass: 0 };
const styleAgg = new Map<string, { count: number; fire: number }>();
const descAgg = new Map<string, number>();
const venueAgg = new Map<string, { count: number; fire: number }>();
let spendTotal = 0;
let spendCount = 0;

for (const t of scope) {
  if (t.verdict && t.verdict in verdicts) verdicts[t.verdict]++;

  const cat = metaOf(t).category;
  const s = styleAgg.get(cat) ?? { count: 0, fire: 0 };
  s.count++;
  if (t.verdict === "fire") s.fire++;
  styleAgg.set(cat, s);

  // дескрипторы только из понравившегося (fire/good) — это и есть профиль вкуса
  if (t.verdict !== "pass") {
    for (const d of t.descriptors ?? []) descAgg.set(d, (descAgg.get(d) ?? 0) + 1);
  }

  if (t.venue) {
    const v = venueAgg.get(t.venue) ?? { count: 0, fire: 0 };
    v.count++;
    if (t.verdict === "fire") v.fire++;
    venueAgg.set(t.venue, v);
  }

  if (typeof t.pricePaid === "number") {
    spendTotal += t.pricePaid;
    spendCount++;
  }
}

const byCount = <T extends { count: number }>(a: T, b: T) => b.count - a.count;
const card = (t: Tasting) => ({ beer: t.beer, style: metaOf(t).style, venue: t.venue ?? null });

const out = {
  scope: { total: scope.length, ofAll: tastings.length, venue: venueFilter ?? null, style: styleFilter ?? null },
  verdicts,
  styles: [...styleAgg.entries()]
    .map(([category, v]) => ({ category, ...v }))
    .sort(byCount),
  topDescriptors: [...descAgg.entries()]
    .map(([descriptor, n]) => ({ descriptor, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 12),
  fires: scope.filter((t) => t.verdict === "fire").map(card),
  wouldRepeat: scope.filter((t) => t.wouldRepeat).map(card),
  spend: { total: spendTotal, count: spendCount, avg: spendCount ? Math.round(spendTotal / spendCount) : null },
  venues: [...venueAgg.entries()]
    .map(([venue, v]) => ({ venue, ...v }))
    .sort(byCount),
};

console.log(JSON.stringify(out));
