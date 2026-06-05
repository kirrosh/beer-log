/**
 * bot-recommend.ts — «топ-5 под меня» на точке (TASK-43). Детерминированный ранжировщик:
 * профиль вкуса (tastings) × пул точки (что сейчас налито) → смешанный топ с объяснением «почему».
 *
 * Вход:  bun run scripts/bot-recommend.ts --seller <seller> [--limit 5]
 * Выход: компактный JSON — recommendations[] (branch repeat|new, score, reasons, обложка) + profile.
 *
 * Без векторов и LLM (TASK-36 — апгрейд потом): скоринг лексический/категориальный, читается у полки
 * мгновенно. Переиспользует buildVenuePersonal (пул + срезы) и loadPersonal (профиль) — не дублирует.
 * Деградация при пустом профиле (<2 дегустаций): fallback на highlights + свежесть/наличие.
 */
import { Database } from "bun:sqlite";
import { buildVenuePersonal, loadPersonal } from "./lib/venue-personal.ts";
import { ageDays } from "./lib/provenance.ts";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
};
const seller = flag("seller");
const limit = Number(flag("limit") ?? 5);
if (!seller) {
  console.error("usage: bot-recommend.ts --seller <seller> [--limit 5]");
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: true });

// ── профиль вкуса из tastings ─────────────────────────────────────────────────────
const { tastings, highlights } = loadPersonal();
// категория стиля по beerId (для соотнесения вкуса с пулом)
const tastedIds = [...new Set(tastings.map((t) => t.beerId).filter(Boolean) as string[])];
const catById = new Map<string, string>();
const breweryById = new Map<string, string | null>();
if (tastedIds.length) {
  const rows = db.query(
    `SELECT id, style_category, brewery_id FROM beers WHERE id IN (${tastedIds.map(() => "?").join(",")})`,
  ).all(...tastedIds) as { id: string; style_category: string | null; brewery_id: string | null }[];
  for (const r of rows) {
    catById.set(r.id, r.style_category ?? "unknown");
    breweryById.set(r.id, r.brewery_id);
  }
}

const fireStyles = new Set<string>();
const goodStyles = new Set<string>();
const favBreweries = new Set<string>();
for (const t of tastings) {
  const cat = t.beerId ? catById.get(t.beerId) : undefined;
  if (cat && cat !== "unknown") {
    if (t.verdict === "fire") fireStyles.add(cat);
    else if (t.verdict === "good") goodStyles.add(cat);
  }
  if (t.beerId && (t.favorite || t.verdict === "fire")) {
    const b = breweryById.get(t.beerId);
    if (b) favBreweries.add(b);
  }
}
const tastedSet = new Set(tastedIds);
const repeatable = new Set(
  tastings.filter((t) => t.beerId && (t.verdict === "fire" || t.wouldRepeat)).map((t) => t.beerId as string),
);
const profileThin = tastings.length < 2;

// бейдж highlight по beerId на этой точке (для new-ветки и fallback)
const hlBadge = new Map<string, { badge: string; reason: string }>();
for (const h of highlights) {
  if (h.venue === seller && h.beerId) hlBadge.set(h.beerId, { badge: h.badge, reason: h.reason });
}

// ── пул точки + мета сортов (обложка/abv/стиль) ────────────────────────────────────
const vp = buildVenuePersonal(db, seller);
const pool = vp.pool;
const poolIds = pool.map((p) => p.beerId).filter(Boolean) as string[];
type Meta = { image: string | null; abv: number | null; style: string | null };
const metaById = new Map<string, Meta>();
if (poolIds.length) {
  const rows = db.query(
    `SELECT id, image_url, abv, style_name FROM beers WHERE id IN (${poolIds.map(() => "?").join(",")})`,
  ).all(...poolIds) as { id: string; image_url: string | null; abv: number | null; style_name: string | null }[];
  for (const r of rows) metaById.set(r.id, { image: r.image_url, abv: r.abv, style: r.style_name });
}
db.close();

const HL_WEIGHT: Record<string, number> = { "must-try": 0.5, "hidden-gem": 0.4, value: 0.3, seasonal: 0.3 };
const BADGE_RU: Record<string, string> = {
  "must-try": "обязательно к пробе на точке",
  "hidden-gem": "недооценённое здесь",
  value: "выгодно",
  seasonal: "сезонное",
};

type Rec = {
  beerId: string | null; beer: string; brewery: string | null; style: string | null;
  abv: number | null; format: string; price: number | null; image: string | null;
  branch: "repeat" | "new" | "discover"; score: number; reasons: string[];
};

const recs: Rec[] = pool.map((p) => {
  const meta = p.beerId ? metaById.get(p.beerId) : undefined;
  const cat = p.styleCategory ?? "unknown";
  const reasons: string[] = [];
  let score = 0;
  let branch: Rec["branch"] = "new";

  const tasted = !!p.beerId && tastedSet.has(p.beerId);
  if (tasted && p.beerId && repeatable.has(p.beerId)) {
    branch = "repeat";
    score = 1;
    reasons.push("ты её уже оценил 🔥/повторил бы");
  } else if (!tasted) {
    branch = "new";
    if (cat !== "unknown" && fireStyles.has(cat)) { score += 0.6; reasons.push(`твой топ-стиль (${cat})`); }
    else if (cat !== "unknown" && goodStyles.has(cat)) { score += 0.4; reasons.push(`заходящий стиль (${cat})`); }
    if (p.breweryId && favBreweries.has(p.breweryId)) { score += 0.4; reasons.push("любимая пивоварня"); }
    const hl = p.beerId ? hlBadge.get(p.beerId) : undefined;
    if (hl) { score += HL_WEIGHT[hl.badge] ?? 0.3; reasons.push(BADGE_RU[hl.badge] ?? hl.badge); }
    const age = ageDays(p.seenAt);
    if (age <= 14) { score += 0.1; reasons.push("свежее на полке"); }
  } else {
    // пробовал, но не «повторил бы» — не навязываем (низкий приоритет, отдельная ветка)
    branch = "repeat";
    score = 0.2;
    reasons.push("уже пробовал");
  }

  return {
    beerId: p.beerId, beer: p.breweryName ? `${p.breweryName} ${p.beerName}` : p.beerName,
    brewery: p.breweryName, style: meta?.style ?? null, abv: meta?.abv ?? null,
    format: p.format, price: p.price, image: meta?.image ?? null, branch, score: Math.round(score * 100) / 100, reasons,
  };
});

// ── микс: до 2 «повторить» + остальное «новое», добор до limit ───────────────────────
let chosen: Rec[];
const hasSignal = recs.some((r) => r.score >= 0.4 && r.branch !== "repeat") || repeatable.size > 0;

if (profileThin || !hasSignal) {
  // деградация: профиля мало → highlights впереди, дальше свежее/с ценой; ветка discover
  chosen = recs
    .map((r) => {
      const hl = r.beerId ? hlBadge.get(r.beerId) : undefined;
      const s = (hl ? (HL_WEIGHT[hl.badge] ?? 0.3) : 0) + (r.price != null ? 0.05 : 0);
      const reasons = hl ? [BADGE_RU[hl.badge] ?? hl.badge] : ["в наличии на точке"];
      return { ...r, branch: "discover" as const, score: Math.round(s * 100) / 100, reasons };
    })
    .sort((a, b) => b.score - a.score || (b.price != null ? 1 : 0) - (a.price != null ? 1 : 0))
    .slice(0, limit);
} else {
  const repeats = recs.filter((r) => r.branch === "repeat" && r.score >= 0.9).sort((a, b) => b.score - a.score);
  const news = recs.filter((r) => r.branch === "new" && r.score > 0).sort((a, b) => b.score - a.score);
  const head = repeats.slice(0, 2);
  const rest = news.slice(0, Math.max(0, limit - head.length));
  chosen = [...head, ...rest];
  if (chosen.length < limit) {
    const have = new Set(chosen.map((r) => r.beerId ?? r.beer));
    for (const r of [...news.slice(rest.length), ...repeats.slice(head.length)]) {
      if (chosen.length >= limit) break;
      if (!have.has(r.beerId ?? r.beer)) { chosen.push(r); have.add(r.beerId ?? r.beer); }
    }
  }
}

const out = {
  seller,
  poolSize: pool.length,
  fallbackMode: profileThin || !hasSignal,
  profile: {
    tasted: tastings.length,
    fireStyles: [...fireStyles],
    goodStyles: [...goodStyles],
    favoriteBreweries: favBreweries.size,
  },
  recommendations: chosen,
};
console.log(JSON.stringify(out));
