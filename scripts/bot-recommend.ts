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
import { buildVenuePersonal, loadPersonal, loadBeerMeta, tasteProfile } from "./lib/venue-personal.ts";
import { ageDays, freshness } from "./lib/provenance.ts";
import { styleValueMedians, valueSignal, type ValueSignal } from "./lib/value-index.ts";
import { breadthMap, persistenceForSeller, marketSignal, type MarketAssessment } from "./lib/market-signals.ts";
import { loadCanon, type CanonType } from "./lib/canon.ts";

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

// ── профиль вкуса из tastings (общая lib-логика) ───────────────────────────────────
const { tastings, highlights } = loadPersonal();
// Канон («что маст-трай»): незакрытые визитки/эталоны с точки получают приоритет в discover-слотах
const canonByBeer = new Map<string, { canonType: CanonType; basis: string }>();
for (const c of loadCanon().canon) if (c.beerId) canonByBeer.set(c.beerId, { canonType: c.canonType, basis: c.basis });
const tasteMeta = loadBeerMeta(db, tastings.map((t) => t.beerId));
const { fireStyles, goodStyles, favBreweries, tastedSet, repeatable } = tasteProfile(tastings, tasteMeta);
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
type Meta = { image: string | null; abv: number | null; style: string | null; slug: string | null };
const metaById = new Map<string, Meta>();
if (poolIds.length) {
  const rows = db.query(
    `SELECT id, image_url, abv, style_name, slug FROM beers WHERE id IN (${poolIds.map(() => "?").join(",")})`,
  ).all(...poolIds) as { id: string; image_url: string | null; abv: number | null; style_name: string | null; slug: string | null }[];
  for (const r of rows) metaById.set(r.id, { image: r.image_url, abv: r.abv, style: r.style_name, slug: r.slug });
}
// Value Index: медианы ₽/литр по стилям — рыночный сигнал «выгодно/переплата» (TASK-50)
const valueMedians = styleValueMedians(db);
// Рыночные сигналы: дистрибуция (по всему каталогу) + персистентность пар на этой точке (TASK-51)
const breadth = breadthMap(db);
const persistence = persistenceForSeller(db, seller);
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
  seenAt: string; stale: boolean;   // свежесть наличия — кран ротируется, предупреждаем у полки
  value: ValueSignal | null;        // ₽/литр vs медиана стиля (TASK-50)
  breadth: number | null;           // в скольких продавцах держат сорт (TASK-51)
  market: MarketAssessment;         // бонус+причины дистрибуции/персистентности (для fallback-ветки)
  canonOpen: { canonType: CanonType; basis: string } | null; // незакрытый канон на точке (TASK-54)
};

const recs: Rec[] = pool.map((p) => {
  const meta = p.beerId ? metaById.get(p.beerId) : undefined;
  const cat = p.styleCategory ?? "unknown";
  const reasons: string[] = [];
  let score = 0;
  let branch: Rec["branch"] = "new";

  // Value Index: ₽/литр этого листинга против медианы стиля (объективный денежный сигнал)
  const value = valueSignal({ price: p.price, volumeMl: p.volumeMl, category: cat }, valueMedians);
  // Рыночные сигналы: дистрибуция сорта + персистентность пары (сорт, точка)
  const breadthN = p.beerId ? breadth.get(p.beerId) : undefined;
  const persist = meta?.slug ? persistence.get(meta.slug) : undefined;
  const market = marketSignal(breadthN, persist);

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

  // value/рынок влияют на скоринг только для «нового» (не двигаем приоритет повторов), но фразы
  // (выгодно/переплата, дистрибуция, якорь) показываем у любой ветки — честные аргументы у полки
  if (value) {
    if (branch === "new") score += value.bonus;
    if (value.reason) reasons.push(value.reason);
  }
  if (branch === "new") score += market.bonus;
  reasons.push(...market.reasons);

  // незакрытый канон на точке: не пробовал И сорт в canon.json
  const canonOpen = (!tasted && p.beerId && canonByBeer.has(p.beerId)) ? canonByBeer.get(p.beerId)! : null;

  const fresh = freshness(p.seenAt);
  return {
    beerId: p.beerId, beer: p.breweryName ? `${p.breweryName} ${p.beerName}` : p.beerName,
    brewery: p.breweryName, style: meta?.style ?? null, abv: meta?.abv ?? null,
    format: p.format, price: p.price, image: meta?.image ?? null, branch, score: Math.round(score * 100) / 100, reasons,
    seenAt: p.seenAt, stale: fresh.stale, value, breadth: breadthN ?? null, market, canonOpen,
  };
});

// ── микс: до 2 «повторить» + discover-квота под канон + «новое», добор до limit ──────
// Квота discover (TASK-54): 1–2 слота из топа всегда под незакрытый канон с точки — иначе петля
// самоподтверждения сужает вкус. Канон вне вкусовой модели: визитка > эталон > классика.
const DISCOVER_QUOTA = 2;
const CANON_RANK: Record<CanonType, number> = { "brewery-flagship": 0, "style-benchmark": 1, "ru-classic": 2 };
const CANON_RU: Record<CanonType, string> = {
  "brewery-flagship": "канон: визитка пивоварни — стоит закрыть",
  "style-benchmark": "канон: эталон стиля — стоит закрыть",
  "ru-classic": "канон: классика рос. крафта — стоит закрыть",
};

let chosen: Rec[];
const hasSignal = recs.some((r) => r.score >= 0.4 && r.branch !== "repeat") || repeatable.size > 0;

if (profileThin || !hasSignal) {
  // деградация: профиля мало → канон/highlights впереди, дальше свежее/с ценой; ветка discover
  chosen = recs
    .map((r) => {
      const hl = r.beerId ? hlBadge.get(r.beerId) : undefined;
      const s = (hl ? (HL_WEIGHT[hl.badge] ?? 0.3) : 0) + (r.price != null ? 0.05 : 0)
        + (r.value?.bonus ?? 0) + r.market.bonus + (r.canonOpen ? 0.5 : 0);
      const reasons = r.canonOpen ? [CANON_RU[r.canonOpen.canonType]] : (hl ? [BADGE_RU[hl.badge] ?? hl.badge] : ["в наличии на точке"]);
      if (r.value?.reason) reasons.push(r.value.reason);
      reasons.push(...r.market.reasons);
      return { ...r, branch: "discover" as const, score: Math.round(s * 100) / 100, reasons };
    })
    .sort((a, b) => b.score - a.score || (b.price != null ? 1 : 0) - (a.price != null ? 1 : 0))
    .slice(0, limit);
} else {
  const repeats = recs.filter((r) => r.branch === "repeat" && r.score >= 0.9).sort((a, b) => b.score - a.score);
  const head = repeats.slice(0, 2);

  // discover-слоты под незакрытый канон (приоритет: тип канона, затем score)
  const discoverPicks = recs
    .filter((r) => r.canonOpen)
    .sort((a, b) => CANON_RANK[a.canonOpen!.canonType] - CANON_RANK[b.canonOpen!.canonType] || b.score - a.score)
    .slice(0, Math.min(DISCOVER_QUOTA, Math.max(0, limit - head.length)))
    .map((r) => ({ ...r, branch: "discover" as const, reasons: [CANON_RU[r.canonOpen!.canonType], ...r.reasons] }));
  const discoverIds = new Set(discoverPicks.map((r) => r.beerId ?? r.beer));

  const news = recs.filter((r) => r.branch === "new" && r.score > 0 && !discoverIds.has(r.beerId ?? r.beer))
    .sort((a, b) => b.score - a.score);
  const rest = news.slice(0, Math.max(0, limit - head.length - discoverPicks.length));
  chosen = [...head, ...discoverPicks, ...rest];
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
