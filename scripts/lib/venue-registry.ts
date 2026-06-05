// Индекс точек продаж для экрана точки (TASK-34, #1). Превращает «сырые» seller-строки из
// price_listings в список физических ТОЧЕК (бар/магазин у полки) с человекочитаемым именем,
// городом и типом. Отделяет точки от веб-магазинов: точка = seller с '/' в идентификаторе
// (untappd/<slug>, beermug-nn/<адрес>), веб-магазин = домен (beerkontora.ru) — у него «полки» нет.
//
//   const venues = venueIndex(db);                 // [{ id, seller, name, city, type, poolSize }]
//   const seller = idToSeller("untappd__tbpbar");  // "untappd/tbpbar"
//
// id — url-safe форма seller ('/' → '__'), обратимая без обращения к индексу: роут /venue/[id]
// резолвит точку, не таская весь список. Имена/города берём из реестра Untappd-венью
// (data/venues/registry.json, трек E), для сети Beer Mug — из эвристики (реестра нет).
import { readFileSync } from "node:fs";
import { normalizeName, nameSimilarity } from "@beer-log/catalog-core";
import type { Database } from "bun:sqlite";

export type VenueInfo = {
  id: string;          // url-safe id: seller с '/' → '__'
  seller: string;      // price_listings.seller (источник истины)
  name: string;        // человекочитаемое имя точки
  city: string | null;
  type: string;        // bar | shop | unknown
  source: string;      // untappd | beermug | other (происхождение данных точки)
  poolSize: number;    // число листингов под seller (сырое, до дедупа пула)
  lat: number | null;  // координаты точки (TASK-42). Пока заполнены не у всех — наполнение
  lng: number | null;  // отдельная задача; haversine считается только когда обе известны.
  mapUrl: string;      // deeplink-поиск в Яндекс.Картах по имени+городу (карта без координат)
};

const SLASH = "__";
export const sellerToId = (seller: string): string => seller.split("/").join(SLASH);
export const idToSeller = (id: string): string => id.split(SLASH).join("/");

/** Домашний город: его точки (и бары в нём) поднимаем в начало списка. */
export const HOME_CITY = process.env.HOME_CITY ?? "Нижний Новгород";

/** Точка (физическая полка) vs веб-магазин: у точки seller содержит '/' (untappd/…, beermug-nn/…). */
const isVenueSeller = (seller: string): boolean => seller.includes("/");

// Явные мета-оверрайды для точек НЕ из реестра (TG-тап-листы баров и пр.), ключ — полный seller.
// Реестр (registry.json) покрывает только untappd/<slug>; TG-бары иначе остались бы без города/типа.
const SELLER_OVERRIDES: Record<string, RegEntry> = {
  "t.me/chekhov_nn": { name: "Чехов", city: "Нижний Новгород", type: "bar" },
  "t.me/hopheadnn": { name: "Hophead НН", city: "Нижний Новгород", type: "bar" },
};

// Канонизация города: область → город (защита от рассинхрона, источник чиним в registry.json).
const CITY_CANON: Record<string, string> = {
  "Нижегородская обл.": "Нижний Новгород",
  "Нижегородская область": "Нижний Новгород",
};
const canonCity = (city: string | null): string | null => (city ? CITY_CANON[city] ?? city : city);

/** Бароподобная точка (бар или бар-магазин) — для приоритета «бары впереди». */
export const isBarLike = (type: string): boolean => type === "bar" || type === "bar-shop";

type RegEntry = { name: string; city: string | null; type: string; lat?: number | null; lng?: number | null };
function loadRegistry(path = "data/venues/registry.json"): Map<string, RegEntry> {
  const m = new Map<string, RegEntry>();
  try {
    const r = JSON.parse(readFileSync(path, "utf8")) as {
      venues?: { slug: string; name: string; city?: string | null; type?: string; lat?: number; lng?: number }[];
    };
    for (const v of r.venues ?? []) {
      m.set(`untappd/${v.slug}`, {
        name: v.name, city: v.city ?? null, type: v.type ?? "unknown", lat: v.lat ?? null, lng: v.lng ?? null,
      });
    }
  } catch { /* реестра нет — упадём на эвристику */ }
  return m;
}

/** Deeplink-поиск точки в Яндекс.Картах по имени+городу — карта/маршрут без знания координат. */
export function mapUrlFor(name: string, city: string | null): string {
  const q = [name.replace(/·/g, " ").replace(/\s+/g, " ").trim(), city].filter(Boolean).join(", ");
  return `https://yandex.ru/maps/?text=${encodeURIComponent(q)}`;
}

/** Расстояние между двумя точками по формуле гаверсинуса, км. Для сортировки «ближайшие». */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)) * 10) / 10;
}

// эвристики для seller без записи в реестре (сеть Beer Mug и пр.)
function fallbackName(seller: string): string {
  if (seller.startsWith("beermug")) {
    const addr = (seller.split("/")[1] ?? "").replace(/-/g, " ").trim()
      .replace(/\b\p{L}/gu, (c) => c.toUpperCase());
    return addr ? `Beer Mug · ${addr}` : "Beer Mug";
  }
  return (seller.split("/").pop() ?? seller).replace(/-/g, " ");
}
function fallbackCity(seller: string): string | null {
  if (seller.startsWith("beermug-nn")) return "Нижний Новгород";
  return null;
}
function fallbackType(seller: string): string {
  if (seller.startsWith("beermug")) return "bar";
  return "unknown";
}
function sourceOf(seller: string): string {
  if (seller.startsWith("untappd/")) return "untappd";
  if (seller.startsWith("beermug")) return "beermug";
  return "other";
}

/** Список всех известных точек, отсортированный по объёму пула (богатые точки сверху). */
export function venueIndex(db: Database, registryPath?: string): VenueInfo[] {
  const reg = loadRegistry(registryPath);
  const rows = db.query(
    `SELECT seller, COUNT(*) AS c FROM price_listings
     WHERE seller IS NOT NULL AND seller != '' GROUP BY seller`,
  ).all() as { seller: string; c: number }[];

  return rows
    .filter((r) => isVenueSeller(r.seller))
    .map((r): VenueInfo => {
      // приоритет источника меты: явный оверрайд → реестр → эвристика
      const info = SELLER_OVERRIDES[r.seller] ?? reg.get(r.seller);
      const name = info?.name ?? fallbackName(r.seller);
      const city = canonCity(info?.city ?? fallbackCity(r.seller));
      return {
        id: sellerToId(r.seller),
        seller: r.seller,
        name,
        city,
        type: info?.type ?? fallbackType(r.seller),
        source: sourceOf(r.seller),
        poolSize: r.c,
        lat: info?.lat ?? null,
        lng: info?.lng ?? null,
        mapUrl: mapUrlFor(name, city),
      };
    })
    // НН-бары → НН-прочее → остальные; внутри ранга — по объёму пула
    .sort((a, b) => venueRank(a) - venueRank(b) || b.poolSize - a.poolSize || a.name.localeCompare(b.name, "ru"));
}

/** Ранг для сортировки: домашние бары (0) → домашние прочие (1) → остальные (2). */
function venueRank(v: VenueInfo): number {
  if (v.city === HOME_CITY) return isBarLike(v.type) ? 0 : 1;
  return 2;
}

// ── резолв точки по словам (TASK-46): «на Гагарина» / «в Beer Mug» → seller ──────
export type VenueResolution = {
  input: string;
  resolved: VenueInfo | null;            // уверенный матч (для записи venue), иначе null
  candidates: (VenueInfo & { score: number })[]; // топ кандидатов на уточнение агентом
};

/** Схожесть запроса с точкой: имя, адресная часть seller и префикс сети (translit-устойчиво). */
function venueScore(input: string, v: VenueInfo): number {
  const qi = normalizeName(input);
  if (!qi) return 0;
  const addr = v.seller.split("/")[1] ?? "";
  const chain = v.seller.split("/")[0] ?? "";
  let best = 0;
  for (const t of [v.name, addr, chain]) {
    const tn = normalizeName(t);
    if (!tn) continue;
    if (tn.includes(qi) || qi.includes(tn)) best = Math.max(best, 0.9); // вхождение слова («гагарина» ⊂ «gagarina118»)
    best = Math.max(best, nameSimilarity(input, t));
  }
  return best;
}

/**
 * Резолв точки из произвольной фразы. Если уже передан seller (есть '/') — берём как есть.
 * Уверенный матч (score ≥ STRONG и явный лидер) → resolved; иначе кандидаты на уточнение.
 * Запись дегустации НЕ блокируется отсутствием venue — это решает вызывающий.
 */
export function resolveVenue(db: Database, input: string, registryPath?: string): VenueResolution {
  const q = input.trim();
  if (!q) return { input, resolved: null, candidates: [] };

  const venues = venueIndex(db, registryPath);
  // уже готовый seller — не угадываем
  if (q.includes("/")) {
    const exact = venues.find((v) => v.seller === q);
    if (exact) return { input, resolved: exact, candidates: [{ ...exact, score: 1 }] };
  }

  const STRONG = 0.6, KEEP = 0.4, LEAD = 0.15;
  const scored = venues
    .map((v) => ({ ...v, score: venueScore(q, v) }))
    .filter((v) => v.score >= KEEP)
    .sort((a, b) => b.score - a.score || venueRank(a) - venueRank(b));

  const top = scored[0];
  const confident = !!top && top.score >= STRONG &&
    (scored.length === 1 || top.score - (scored[1]?.score ?? 0) >= LEAD);
  return {
    input,
    resolved: confident ? stripScore(top) : null,
    candidates: scored.slice(0, 3),
  };
}

function stripScore(v: VenueInfo & { score: number }): VenueInfo {
  const { score, ...rest } = v;
  return rest;
}
