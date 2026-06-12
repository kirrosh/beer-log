/**
 * bot-nearby.ts — «куда пойти / где рядом» (TASK-42). Список крафтовых точек города (по умолчанию
 * HOME_CITY) с маркерами и ссылкой на карту к каждой. Бары — впереди, дальше по объёму ассортимента.
 *
 * Вход:  bun run scripts/bot-nearby.ts [--city "<город>"] [--lat <ш>] [--lng <д>] [--limit 10]
 * Выход: компактный JSON — venues[] (name/seller/type/poolSize/mapUrl/markers/lat/lng[, distanceKm]).
 *
 * Честная рамка (TASK-42/41): координат у точек пока почти нет, а форк-плагина Telegram НЕ
 * передаёт геолокацию пользователя — поэтому радиус по live-локации сейчас неактивен. Если координаты
 * юзера всё же переданы флагами и у точки есть lat/lng — сортируем по haversine; иначе по релевантности
 * (бар→магазин, объём пула). Ссылка на карту (mapUrl) — deeplink-поиск, работает без координат.
 */
import { Database } from "bun:sqlite";
import { venueIndex, HOME_CITY, isBarLike, haversineKm, type VenueInfo } from "./lib/venue-registry.ts";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
};
const city = flag("city") ?? HOME_CITY;
const limit = Number(flag("limit") ?? 10);
const lat = flag("lat") != null ? Number(flag("lat")) : null;
const lng = flag("lng") != null ? Number(flag("lng")) : null;
const hasUserLoc = lat != null && !Number.isNaN(lat) && lng != null && !Number.isNaN(lng);

const db = new Database(DB_PATH, { readonly: true });
const all = venueIndex(db);
db.close();

const POOL_RICH = 200; // листингов — порог «большой выбор» 📦

function markers(v: VenueInfo): string[] {
  const m: string[] = [];
  if (v.type === "bar") m.push("🍺 бар");
  else if (v.type === "bar-shop") m.push("🍺🛒 бар-магазин");
  else if (v.type === "shop") m.push("🛒 магазин");
  if (v.poolSize >= POOL_RICH) m.push("📦 большой выбор");
  return m;
}

const inCity = all.filter((v) => v.city === city);
const withDist = inCity.map((v) => ({
  v,
  dist: hasUserLoc && v.lat != null && v.lng != null ? haversineKm(lat!, lng!, v.lat, v.lng) : null,
}));

// сортировка: если есть дистанции — ближайшие сверху (точки без координат уходят в хвост);
// иначе бар→магазин, потом по объёму пула.
withDist.sort((a, b) => {
  if (hasUserLoc) {
    if (a.dist != null && b.dist != null) return a.dist - b.dist;
    if (a.dist != null) return -1;
    if (b.dist != null) return 1;
  }
  const rank = (x: VenueInfo) => (isBarLike(x.type) ? 0 : x.type === "shop" ? 1 : 2);
  return rank(a.v) - rank(b.v) || b.v.poolSize - a.v.poolSize || a.v.name.localeCompare(b.v.name, "ru");
});

const out = {
  city,
  userLocation: hasUserLoc ? { lat, lng } : null,
  geoRadiusActive: hasUserLoc && withDist.some((x) => x.dist != null),
  note: hasUserLoc
    ? "сортировка по расстоянию (где есть координаты точки)"
    : "координат пользователя нет — список по релевантности (бары впереди); у каждой точки ссылка на карту",
  venues: withDist.slice(0, limit).map(({ v, dist }) => ({
    name: v.name, seller: v.seller, type: v.type, poolSize: v.poolSize,
    mapUrl: v.mapUrl, markers: markers(v), distanceKm: dist,
    // координаты точки — для <tg-map> в rich-ответе бота (null = карты в сообщении не будет)
    lat: v.lat, lng: v.lng,
  })),
};
console.log(JSON.stringify(out));
