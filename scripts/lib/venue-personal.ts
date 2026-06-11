// Личные срезы поверх объединённого пула точки (TASK-33, B4). Превращает «список что налито» в
// ответы у полки: «что я тут ещё НЕ пробовал», «от любимых пивоварен тут есть…», «топ точки»
// (редакторские highlights), «замена той, что не нашёл» (бренд→стиль→категория).
//
//   const vp = buildVenuePersonal(db, "beermug-nn/gagarina-118");
//   vp.notTasted();          // PoolItem[] — анти-повтор по tastings
//   vp.fromFavorites();      // PoolItem[] — из любимых пивоварен (tastings favorite|fire)
//   vp.highlights();         // редакторские бейджи точки, пересечённые с пулом
//   vp.substitution(beerId); // каскад замены для отсутствующего/любого сорта
//
// Источник личного — data/personal/{tastings,highlights}.json (правит агент, UI нет). Срезы
// корректно деградируют при пустых tastings: notTasted=весь пул, fromFavorites=пусто.
import { buildPool, type PoolItem } from "./venue-search.ts";
import { categorizeStyle, normalizeName } from "@beer-log/catalog-core";
import { readFileSync, writeFileSync } from "node:fs";
import type { Database } from "bun:sqlite";

// стиль сорта: из БД-поля, а если пусто/unknown — детект из имени (стиль зашит в названии,
// напр. «Атомная Прачечная American Ipa»). Возвращает slug + category.
function effectiveStyle(styleSlug: string | null, name: string): { slug: string; category: string } {
  if (styleSlug && styleSlug !== "unknown") {
    const c = categorizeStyle(name);
    return { slug: styleSlug, category: c.category };
  }
  const c = categorizeStyle(name);
  return { slug: c.slug, category: c.category };
}

export type Verdict = "fire" | "good" | "pass";
export type Tasting = {
  beerId: string | null; beer: string; verdict?: Verdict; favorite?: boolean;
  wouldRepeat?: boolean; note?: string; descriptors?: string[]; venue?: string;
  format?: string; pricePaid?: number; tastedAt?: string; media?: string[];
};
export type Highlight = {
  venue: string; beerId: string | null; beer: string; badge: string; reason: string;
};

export type HighlightItem = Highlight & { inPool: boolean; item: PoolItem | null };
export type Substitution = {
  level: "brewery" | "style" | "category" | "none"; // основание замены
  candidates: PoolItem[];
};

export function loadPersonal(dir = "data/personal"): { tastings: Tasting[]; highlights: Highlight[] } {
  const tastings = readJsonArray<Tasting>(`${dir}/tastings.json`, "tastings");
  const highlights = readJsonArray<Highlight>(`${dir}/highlights.json`, "highlights");
  return { tastings, highlights };
}

// ── профиль вкуса (общий для bot-profile #8/#15 и bot-recommend #43) ──────────────
// Единый источник: мета сорта по beerId + выведенный вкусовой профиль. Раньше дублировалось
// в обоих скриптах (fireStyles/favBreweries чуть по-разному) — теперь одна реализация.
export type BeerMeta = { category: string; styleName: string | null; breweryId: string | null; abv: number | null };

/** Мета каталога по списку beerId одним запросом (стиль/категория/пивоварня/ABV). */
export function loadBeerMeta(db: Database, beerIds: (string | null | undefined)[]): Map<string, BeerMeta> {
  const ids = [...new Set(beerIds.filter(Boolean) as string[])];
  const m = new Map<string, BeerMeta>();
  if (!ids.length) return m;
  const rows = db.query(
    `SELECT id, style_name, style_category, brewery_id, abv FROM beers WHERE id IN (${ids.map(() => "?").join(",")})`,
  ).all(...ids) as { id: string; style_name: string | null; style_category: string | null; brewery_id: string | null; abv: number | null }[];
  for (const r of rows) {
    m.set(r.id, { category: r.style_category ?? "unknown", styleName: r.style_name, breweryId: r.brewery_id, abv: r.abv });
  }
  return m;
}

export type TasteProfile = {
  fireStyles: Set<string>;      // категории стилей с вердиктом fire
  goodStyles: Set<string>;      // категории с вердиктом good
  favBreweries: Set<string>;    // breweryId любимых (favorite|fire)
  tastedSet: Set<string>;       // все пробованные beerId
  repeatable: Set<string>;      // beerId, что повторил бы (fire | wouldRepeat)
};

/** Вывести вкусовой профиль из дегустаций + меты каталога. Категория unknown в стили не идёт. */
export function tasteProfile(tastings: Tasting[], meta: Map<string, BeerMeta>): TasteProfile {
  const fireStyles = new Set<string>();
  const goodStyles = new Set<string>();
  const favBreweries = new Set<string>();
  const tastedSet = new Set<string>();
  const repeatable = new Set<string>();
  for (const t of tastings) {
    if (!t.beerId) continue;
    tastedSet.add(t.beerId);
    const m = meta.get(t.beerId);
    if (m && m.category !== "unknown") {
      if (t.verdict === "fire") fireStyles.add(m.category);
      else if (t.verdict === "good") goodStyles.add(m.category);
    }
    if ((t.favorite || t.verdict === "fire") && m?.breweryId) favBreweries.add(m.breweryId);
    if (t.verdict === "fire" || t.wouldRepeat) repeatable.add(t.beerId);
  }
  return { fireStyles, goodStyles, favBreweries, tastedSet, repeatable };
}

// ── профиль вкуса v2: hit-rate, ABV-зона, cost-per-🔥, анти-сигналы (TASK-57, M5) ────
// От категорий (tasteProfile) к измеримым величинам. Личная статистика лучше любого внешнего
// рейтинга, НО только при достаточном N — ниже порога наблюдений сигнал не применяется (холодный
// старт: 4 дегустации не дают зоны/cost). Единый источник для bot-recommend/profile/lookup.

/** Пороги наблюдений: ниже — сигнал шумный, не применяем (честная деградация при малом N). */
export const TASTE_OBS = {
  brewery: 2,   // hit-rate пивоварни — нужно ≥2 дегустации этой пивоварни
  style: 3,     // hit-rate стиля — ≥3 дегустации стиля
  passMin: 2,   // «не зашло» как анти-сигнал — ≥2 вердикта pass (и ни одного fire)
  abvFires: 3,  // ABV-зона — ≥3 🔥 с известным ABV
  costFires: 3, // cost-per-🔥 — ≥3 🔥 с известной ценой
};

export type Hit = { n: number; fire: number; good: number; pass: number };
export type TasteStats = {
  byBrewery: Map<string, Hit>;        // hit-rate по breweryId
  byStyle: Map<string, Hit>;          // hit-rate по style_category
  byDescriptor: Map<string, Hit>;     // hit-rate по личному дескриптору (только для профиля #8 —
                                      //   у каталожных сортов дескрипторов нет, в скоринг не идёт)
  abvZone: { lo: number; hi: number; n: number } | null; // диапазон ABV, где живут 🔥
  costPerFire: { avg: number; n: number } | null;        // средняя цена 🔥 (₽)
  noRepeat: Set<string>;              // beerId с wouldRepeat===false (жёсткий анти-сигнал)
};

function bump(m: Map<string, Hit>, key: string, v?: Verdict): void {
  const h = m.get(key) ?? { n: 0, fire: 0, good: 0, pass: 0 };
  h.n++;
  if (v === "fire") h.fire++; else if (v === "good") h.good++; else if (v === "pass") h.pass++;
  m.set(key, h);
}

/** Посчитать измеримый профиль вкуса. Категория для null-beerId берётся из имени (categorizeStyle). */
export function tasteStats(tastings: Tasting[], meta: Map<string, BeerMeta>): TasteStats {
  const byBrewery = new Map<string, Hit>();
  const byStyle = new Map<string, Hit>();
  const byDescriptor = new Map<string, Hit>();
  const abvFires: number[] = [];
  const fireCosts: number[] = [];
  const noRepeat = new Set<string>();

  for (const t of tastings) {
    const m = t.beerId ? meta.get(t.beerId) : undefined;
    const cat = m && m.category !== "unknown" ? m.category : categorizeStyle(t.beer ?? "").category;
    if (m?.breweryId) bump(byBrewery, m.breweryId, t.verdict);
    if (cat && cat !== "unknown") bump(byStyle, cat, t.verdict);
    for (const d of t.descriptors ?? []) bump(byDescriptor, d, t.verdict);
    if (t.verdict === "fire" && typeof m?.abv === "number") abvFires.push(m.abv);
    if (t.verdict === "fire" && typeof t.pricePaid === "number") fireCosts.push(t.pricePaid);
    if (t.wouldRepeat === false && t.beerId) noRepeat.add(t.beerId);
  }

  const abvZone = abvFires.length >= TASTE_OBS.abvFires
    ? { lo: Math.min(...abvFires), hi: Math.max(...abvFires), n: abvFires.length }
    : null;
  const costPerFire = fireCosts.length >= TASTE_OBS.costFires
    ? { avg: Math.round(fireCosts.reduce((a, b) => a + b, 0) / fireCosts.length), n: fireCosts.length }
    : null;

  return { byBrewery, byStyle, byDescriptor, abvZone, costPerFire, noRepeat };
}

export type TasteAssessmentInput = {
  beerId: string | null; breweryId: string | null; breweryName?: string | null;
  category: string | null; abv: number | null;
};
export type TasteAssessment = { bonus: number; reasons: string[]; antiReasons: string[] };

/**
 * Оценить кандидата против профиля v2: бонус скоринга + ✓-причины (hit-rate) + ⚠-анти-причины
 * (прошлые 👎, «не возьму снова», ABV вне зоны). Анти-сигналы обязательны — система, которая
 * отговаривает, это половина вэлью. Сигналы подавляются ниже порога наблюдений (TASTE_OBS).
 */
export function tasteAssessment(input: TasteAssessmentInput, stats: TasteStats): TasteAssessment {
  const reasons: string[] = [];
  const antiReasons: string[] = [];
  let bonus = 0;

  // жёсткий анти-сигнал: этот самый сорт помечен «не возьму снова» («за свои норм» ≠ брать снова)
  if (input.beerId && stats.noRepeat.has(input.beerId)) {
    bonus -= 0.5;
    antiReasons.push("⚠ ты отметил «не возьму снова»");
  }

  // hit-rate пивоварни
  const hb = input.breweryId ? stats.byBrewery.get(input.breweryId) : undefined;
  if (hb && hb.n >= TASTE_OBS.brewery) {
    const who = input.breweryName ?? "эта пивоварня";
    if (hb.fire >= 1 && hb.pass === 0) {
      bonus += 0.3;
      reasons.push(`${who}: ${hb.fire}/${hb.n} 🔥`);
    } else if (hb.pass >= TASTE_OBS.passMin && hb.fire === 0) {
      bonus -= 0.3;
      antiReasons.push(`⚠ у «${who}» ты ${hb.pass}× 👎`);
    }
  }

  // hit-rate стиля — только явное «не зашло» как анти (положительное уже даёт tasteProfile.fireStyles)
  const hs = input.category ? stats.byStyle.get(input.category) : undefined;
  if (hs && hs.n >= TASTE_OBS.style && hs.pass >= TASTE_OBS.passMin && hs.fire === 0) {
    bonus -= 0.2;
    antiReasons.push(`⚠ стиль ${input.category} тебе не заходит (${hs.pass}×👎)`);
  }

  // ABV-комфорт-зона: кандидат заметно вне диапазона 🔥 — мягкий штраф
  if (stats.abvZone && typeof input.abv === "number") {
    const { lo, hi } = stats.abvZone;
    if (input.abv > hi + 0.5) {
      bonus -= 0.15;
      antiReasons.push(`⚠ крепче твоей 🔥-зоны (${input.abv}% vs ${lo}–${hi}%)`);
    } else if (input.abv < lo - 0.5) {
      bonus -= 0.1;
      antiReasons.push(`⚠ слабее твоей 🔥-зоны (${input.abv}% vs ${lo}–${hi}%)`);
    }
  }

  return { bonus, reasons, antiReasons };
}

// ── запись дегустаций (TASK-46, D1) ─────────────────────────────────────────────
// Парный писатель к loadPersonal: дозаписывает одну дегустацию в tastings.json, сохраняя _schema
// и формат «одна запись на строку». Идемпотентен по ключу (beerId|raw-имя) + дата + точка: повтор
// той же фразы не плодит дубль, а мерджит новые непустые поля в существующую запись.
// Источник истины файла — этот же JSON; единственный писатель — агент через record-tasting.ts.
const TASTING_KEY_ORDER: (keyof Tasting)[] = [
  "beerId", "beer", "verdict", "favorite", "wouldRepeat", "note",
  "descriptors", "venue", "format", "pricePaid", "tastedAt", "media",
];

// Ключ дедупа: канон (beerId) или нормализованное имя + дата. Точку (venue) НЕ включаем намеренно:
// уточнение venue отдельной репликой («ты был на Гагарина?») домерджится в ту же дегустацию, а не
// создаст дубль. Цена компромисса — один и тот же сорт в один день на двух точках слипнётся в одну
// запись (редкий бар-кроул); для личного лога приемлемо.
function tastingKey(t: Tasting): string {
  const id = t.beerId ?? `raw:${normalizeName(t.beer ?? "")}`;
  return `${id}|${t.tastedAt ?? ""}`;
}

/** Убрать пустые поля и зафиксировать порядок ключей (стабильный diff, читаемые записи). */
function cleanTasting(t: Tasting): Tasting {
  const out: Record<string, unknown> = {};
  for (const k of TASTING_KEY_ORDER) {
    const v = (t as Record<string, unknown>)[k];
    if (v === undefined || v === null && k !== "beerId") continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  if (!("beerId" in out)) out.beerId = null; // beerId обязателен в схеме (null = вне канона)
  return out as Tasting;
}

/** Сериализация tastings.json: _schema без переформатирования смысла, записи — по одной на строку. */
function serializeTastings(schema: unknown, tastings: Tasting[]): string {
  const schemaJson = JSON.stringify(schema, null, 2).split("\n").join("\n  ");
  const body = tastings.map((t) => `    ${JSON.stringify(cleanTasting(t))}`).join(",\n");
  return `{\n  "_schema": ${schemaJson},\n  "tastings": [\n${body}\n  ]\n}\n`;
}

export type AppendResult = { action: "appended" | "merged"; record: Tasting; total: number };

/** Дозаписать дегустацию (идемпотентно). Возвращает финальную запись и действие. */
export function appendTasting(input: Tasting, dir = "data/personal"): AppendResult {
  const path = `${dir}/tastings.json`;
  const raw = JSON.parse(readFileSync(path, "utf8")) as { _schema?: unknown; tastings?: Tasting[] };
  const schema = raw._schema ?? {};
  const list: Tasting[] = Array.isArray(raw.tastings) ? raw.tastings : [];

  const rec = cleanTasting(input);
  const key = tastingKey(rec);
  const idx = list.findIndex((t) => tastingKey(t) === key);

  let action: "appended" | "merged";
  let record: Tasting;
  if (idx >= 0) {
    record = cleanTasting({ ...list[idx], ...rec }); // мерж: новые непустые поля поверх старых
    list[idx] = record;
    action = "merged";
  } else {
    record = rec;
    list.push(record);
    action = "appended";
  }
  writeFileSync(path, serializeTastings(schema, list));
  return { action, record, total: list.length };
}

export function buildVenuePersonal(db: Database, seller: string, personalDir = "data/personal") {
  const pool = buildPool(db, seller);
  const { tastings, highlights } = loadPersonal(personalDir);

  // что уже пробовано (по канону) — для анти-повтора
  const tastedIds = new Set(tastings.map((t) => t.beerId).filter(Boolean) as string[]);
  // любимые пивоварни: из tastings favorite=true ИЛИ verdict=fire → их breweryId
  const favBeerIds = tastings.filter((t) => t.favorite || t.verdict === "fire")
    .map((t) => t.beerId).filter(Boolean) as string[];
  const favoriteBreweries = new Set(favBeerIds.map((id) => breweryOf(db, id)).filter(Boolean) as string[]);

  /** Что на точке я ещё НЕ пробовал (включая нераспознанные raw — их точно не оценивал). */
  function notTasted(): PoolItem[] {
    return pool.filter((p) => !p.beerId || !tastedIds.has(p.beerId));
  }

  /** Сорта на точке от моих любимых пивоварен. */
  function fromFavorites(): PoolItem[] {
    return pool.filter((p) => p.breweryId && favoriteBreweries.has(p.breweryId));
  }

  /** Редакторские «топ точки» (highlights), смердженные с пулом (inPool — на месте ли сейчас). */
  function venueHighlights(): HighlightItem[] {
    return highlights.filter((h) => h.venue === seller).map((h) => {
      const item = pool.find((p) => p.beerId && p.beerId === h.beerId) ?? null;
      return { ...h, inPool: !!item, item };
    });
  }

  /** Замена для сорта (по beerId): тот же бренд → тот же стиль → та же категория, среди пула. */
  function substitution(targetBeerId: string): Substitution {
    const target = db.query(
      "SELECT name, brewery_id AS breweryId, style_slug AS styleSlug FROM beers WHERE id = ?",
    ).get(targetBeerId) as { name: string; breweryId: string | null; styleSlug: string | null } | null;
    if (!target) return { level: "none", candidates: [] };
    const ts = effectiveStyle(target.styleSlug, target.name);

    // не предлагать сам target и то, что и так в пуле под тем же beerId
    const others = pool.filter((p) => p.beerId !== targetBeerId);
    const sameBrewery = others.filter((p) => target.breweryId && p.breweryId === target.breweryId);
    if (sameBrewery.length) return { level: "brewery", candidates: sameBrewery };
    if (ts.slug !== "unknown") {
      const sameStyle = others.filter((p) => effectiveStyle(p.styleSlug, p.beerName).slug === ts.slug);
      if (sameStyle.length) return { level: "style", candidates: sameStyle };
    }
    if (ts.category !== "unknown") {
      const sameCat = others.filter((p) => effectiveStyle(p.styleSlug, p.beerName).category === ts.category);
      if (sameCat.length) return { level: "category", candidates: sameCat };
    }
    return { level: "none", candidates: [] };
  }

  return {
    pool, notTasted, fromFavorites, highlights: venueHighlights, substitution,
    seller, poolSize: pool.length,
    stats: { tastedHere: tastedIds.size, favoriteBreweries: favoriteBreweries.size },
  };
}

// ── утилиты ───────────────────────────────────────────────────────────────────
function breweryOf(db: Database, beerId: string): string | null {
  const r = db.query("SELECT brewery_id AS b FROM beers WHERE id = ?").get(beerId) as { b: string | null } | null;
  return r?.b ?? null;
}

function readJsonArray<T>(path: string, key: string): T[] {
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    const arr = raw?.[key];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
