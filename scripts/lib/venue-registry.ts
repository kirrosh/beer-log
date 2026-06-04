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
import type { Database } from "bun:sqlite";

export type VenueInfo = {
  id: string;          // url-safe id: seller с '/' → '__'
  seller: string;      // price_listings.seller (источник истины)
  name: string;        // человекочитаемое имя точки
  city: string | null;
  type: string;        // bar | shop | unknown
  source: string;      // untappd | beermug | other (происхождение данных точки)
  poolSize: number;    // число листингов под seller (сырое, до дедупа пула)
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
const isBarLike = (type: string): boolean => type === "bar" || type === "bar-shop";

type RegEntry = { name: string; city: string | null; type: string };
function loadRegistry(path = "data/venues/registry.json"): Map<string, RegEntry> {
  const m = new Map<string, RegEntry>();
  try {
    const r = JSON.parse(readFileSync(path, "utf8")) as {
      venues?: { slug: string; name: string; city?: string | null; type?: string }[];
    };
    for (const v of r.venues ?? []) {
      m.set(`untappd/${v.slug}`, { name: v.name, city: v.city ?? null, type: v.type ?? "unknown" });
    }
  } catch { /* реестра нет — упадём на эвристику */ }
  return m;
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
      return {
        id: sellerToId(r.seller),
        seller: r.seller,
        name: info?.name ?? fallbackName(r.seller),
        city: canonCity(info?.city ?? fallbackCity(r.seller)),
        type: info?.type ?? fallbackType(r.seller),
        source: sourceOf(r.seller),
        poolSize: r.c,
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
