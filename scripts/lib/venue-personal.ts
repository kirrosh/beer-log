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
