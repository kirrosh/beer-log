// Парсер Untappd-for-Business venue-меню (TASK-38, трек E). Публичный SSR-HTML страницы заведения
// untappd.com/v/<slug>/<venueId> + её меню-секций. В отличие от untappd-web.ts (список сортов ОДНОЙ
// пивоварни /beer) — здесь МЕНЮ ТОЧКИ: что заведение реально льёт/продаёт, с ценами/форматом/датой.
//
// Структура (вскрыта на Братьях Крафт 3943033, 2026-06-04):
//   • <select class="menu-selector"> — список меню точки: <option value="<menuId>">Tap List</option>,
//     «Bottles & Cans - Russian», «… Imported», «Rare & Special», … Каждое меню = свой menu_id;
//     базовая страница рендерит ПЕРВОЕ, остальные тянутся как `?menu_id=<id>` (меню отдаётся ЦЕЛИКОМ,
//     не обрезано на ~25 как beer-list пивоварни — логин-гейта тут нет).
//   • <li class="menu-item"> — позиция: .beer-label img (обложка, labels.untappd.com/<bid> → task-15),
//     .beer-details h5 a[/b/<slug>/<bid>] (имя сорта, с ведущим «N.»), <em> (стиль),
//     <h6><span> «X% ABV • Y IBU • <a[/w/<slug>/<wid>]>Пивоварня</a>», data-rating, и
//     .beer-prices > p > (span.size, span.price) — РАЗМЕРЫ×ЦЕНЫ (300ml/«330ml Bottle»/«330ml Can»).
//   • <span class="updated-time" data-time="…Z"> — таймстемп среза меню (observed_at, точность до часа).
//   • <select id="brewery_picker"> — ростер пивоварен с counts (для дискавери/детекта меню).
//
// Цены кранов by-pour (300/150ml, format=draft) ≠ unit бутылок/банок — downstream (E4/export) не мешает.
import type { ShopFormat } from "../shops/insales.ts";

const BASE = "https://untappd.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
// Анти-бан: чужой сайт, бьём несколькими запросами на венью (по меню) — рваный ритм с джиттером.
const MENU_DELAY_MS = 800;
const MENU_JITTER_MS = 900;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function decode(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#8230;/g, "…")
    .replace(/&#x?[0-9a-f]+;/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}
function num(s: string | undefined | null): number | null {
  if (!s) return null;
  const n = Number(String(s).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Цена за один размер позиции меню. */
export interface VenueMenuPrice {
  /** исходная метка размера, напр. «330ml Bottle» / «300ml» */
  sizeRaw: string;
  volumeMl: number | null;
  /** формат выведен из метки размера: bottle/can/draft(pour) */
  format: ShopFormat;
  price: number | null;
  currency: string;
}

/** Одна позиция venue-меню Untappd. */
export interface VenueMenuItem {
  /** Untappd beer id (/b/<slug>/<bid>) — точный ключ матча к каталогу (E3) */
  bid: number;
  name: string;
  beerSlug: string;
  url: string;
  styleRaw: string;
  abv: number | null;
  ibu: number | null;
  /** рейтинг Untappd (data-rating), 0..5 */
  rating: number | null;
  /** Untappd brewery id (/w/<slug>/<wid>) — точный ключ матча пивоварни (E3) */
  breweryId: number | null;
  breweryName: string | null;
  brewerySlug: string | null;
  /** абсолютный URL обложки/этикетки (.beer-label img), для рехостинга (task-15); null — нет */
  imageUrl: string | null;
  prices: VenueMenuPrice[];
  /** к какому меню секции принадлежит позиция (для провенанса/дедупа листингов) */
  menuId: string;
  menuName: string;
}

export interface VenueMenuRef {
  menuId: string;
  name: string;
}
export interface VenueMeta {
  venueId: string;
  slug: string;
  name: string;
  /** «Beer Bar, Beer Store» из <h2> — для классификации bar/shop */
  typeRaw: string | null;
  type: "bar" | "shop" | "bar-shop" | "unknown";
  city: string | null;
  verified: boolean;
  logoUrl: string | null;
}
export interface VenueRosterEntry {
  name: string;
  count: number;
}
export interface VenueNearby {
  slug: string;
  venueId: string;
}

/** Полный результат обхода venue-меню: мета + позиции всех секций + провенанс. */
export interface VenueMenusResult {
  meta: VenueMeta;
  menus: VenueMenuRef[];
  items: VenueMenuItem[];
  roster: VenueRosterEntry[];
  /** таймстемп среза меню (ISO) — самый свежий updated-time среди секций; null если нет */
  updatedAt: string | null;
  nearby: VenueNearby[];
  /** есть ли у венью бизнес-меню (роутер дискавери): selector с позициями или menu-item в HTML */
  hasMenu: boolean;
}

// ── чистые парсеры (без сети — основа теста/самопроверки разметки) ──────────────

/** Мета венью из шапки профиля. */
export function parseVenueMeta(html: string, slug: string, venueId: string): VenueMeta {
  // имя — из <h1> блока venue-name (чисто, без хвоста города); фолбэк — <title> без « - …»
  const h1 = decode(/<div class="venue-name">[\s\S]*?<h1>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "");
  const title = /<title>([^<]+)<\/title>/.exec(html)?.[1] ?? "";
  const name = h1 || decode(title.replace(/ - Untappd.*$/i, "").replace(/ -[^-]+$/i, "")) || slug;
  const typeRaw = decode(/<div class="venue-name">[\s\S]*?<h2>([\s\S]*?)<\/h2>/.exec(html)?.[1] ?? "") || null;
  const t = (typeRaw ?? "").toLowerCase();
  const isBar = /\bbar\b|pub|taproom|tap room|gastro/.test(t);
  const isShop = /store|shop|bottle/.test(t);
  const type: VenueMeta["type"] = isBar && isShop ? "bar-shop" : isBar ? "bar" : isShop ? "shop" : "unknown";
  // адрес: «… Moskva, Москва (…»  — берём последний город-токен перед открывающей скобкой
  const addr = decode(/<p class="address">([\s\S]*?)(?:<a |\()/.exec(html)?.[1] ?? "");
  const city = addr ? (addr.split(",").map((s) => s.trim()).filter(Boolean).pop() ?? null) : null;
  const verified = /<span>\s*Verified\s*<\/span>/i.test(html);
  const logoUrl = /<a class="label image-big" data-image="([^"]+)"/.exec(html)?.[1]
    ?? /venuelogos\/venue_\d+[^"'\s]+/.exec(html)?.[0]
    ?? null;
  return { venueId, slug, name, typeRaw, type, city, verified, logoUrl: logoUrl ? abs(logoUrl) : null };
}

/** Список меню-секций точки из <select class="menu-selector">. Пусто — у венью одно/нет меню. */
export function parseVenueMenuSelector(html: string): VenueMenuRef[] {
  const block = /<select class="menu-selector"[^>]*>([\s\S]*?)<\/select>/.exec(html);
  if (!block) return [];
  const out: VenueMenuRef[] = [];
  for (const m of block[1]!.matchAll(/<option value="(\d+)"[^>]*>([\s\S]*?)<\/option>/g)) {
    const name = decode(m[2] ?? "");
    if (name) out.push({ menuId: m[1]!, name });
  }
  return out;
}

/** Таймстемп среза меню (ISO) из <span class="updated-time" data-time="…">. null — нет метки. */
export function parseVenueMenuUpdatedAt(html: string): string | null {
  const m = /<span class="updated-time" data-time="([^"]+)"/.exec(html);
  return m ? m[1]! : null;
}

/** Ростер пивоварен с counts из <select id="brewery_picker">. */
export function parseVenueRoster(html: string): VenueRosterEntry[] {
  const block = /<select id="brewery_picker"[^>]*>([\s\S]*?)<\/select>/.exec(html);
  if (!block) return [];
  const out: VenueRosterEntry[] = [];
  for (const m of block[1]!.matchAll(/<option value="\d+"[^>]*>([\s\S]*?)\((\d+)\)\s*<\/option>/g)) {
    const name = decode(m[1] ?? "");
    if (name && name.toLowerCase() !== "all breweries") out.push({ name, count: Number(m[2]) });
  }
  return out;
}

/** Ссылки на соседние венью (BFS дискавери). nearby отдают только no-menu страницы. */
export function parseNearbyVenues(html: string, selfId: string): VenueNearby[] {
  const out: VenueNearby[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/\/v\/([a-z0-9-]+)\/(\d+)/g)) {
    if (m[2] === selfId || seen.has(m[2]!)) continue;
    seen.add(m[2]!);
    out.push({ slug: m[1]!, venueId: m[2]! });
  }
  return out;
}

/** В имени меню секции зашит формат розлива (Tap List / On Tap / Краны / Разлив)? */
function menuIsTap(menuName: string): boolean {
  return /\btap\b|on tap|draft|кран|разлив/i.test(menuName);
}

/**
 * Формат из метки размера: «… Bottle»→bottle, «… Can»→can, «… Keg»→keg. Если слова-формата нет
 * (только объём, напр. «300ml») — формат неоднозначен: в тап-меню это розлив (draft), в бутылочном
 * НЕизвестен (unknown) — НЕ выдаём за кран, чтобы pour-vs-unit не врал (контекст из имени меню).
 */
export function formatFromSize(sizeRaw: string, menuName = ""): ShopFormat {
  const s = sizeRaw.toLowerCase();
  if (/bottle|бутыл/.test(s)) return "bottle";
  if (/\bcan\b|банк/.test(s)) return "can";
  if (/keg|кег/.test(s)) return "keg";
  if (/draft|pour|розлив|кран/.test(s)) return "draft";
  return menuIsTap(menuName) ? "draft" : "unknown";
}

/** Объём в мл из метки размера: «330ml»/«0.5L»/«1 л». null — не распознан. */
export function volumeFromSize(sizeRaw: string): number | null {
  const ml = /(\d+(?:[.,]\d+)?)\s*ml\b/i.exec(sizeRaw);
  if (ml) return Math.round(num(ml[1])! );
  const l = /(\d+(?:[.,]\d+)?)\s*(?:l|л)\b/i.exec(sizeRaw);
  if (l) return Math.round((num(l[1]) ?? 0) * 1000) || null;
  return null;
}

function parsePrices(block: string, menuName: string): VenueMenuPrice[] {
  const out: VenueMenuPrice[] = [];
  for (const m of block.matchAll(
    /<span class="size">\s*([\s\S]*?)\s*<\/span>\s*<span class="price">\s*([\s\S]*?)\s*<\/span>/g,
  )) {
    const sizeRaw = decode(m[1] ?? "");
    const priceRaw = decode(m[2] ?? "");
    const pm = /([\d., ]+)\s*([A-Za-zА-Яа-я₽]{1,3})?/.exec(priceRaw);
    const price = pm ? num(pm[1]) : null;
    const cur = (pm?.[2] ?? "").toUpperCase();
    out.push({
      sizeRaw,
      volumeMl: volumeFromSize(sizeRaw),
      format: formatFromSize(sizeRaw, menuName),
      price,
      currency: cur === "₽" || cur === "" ? "RUB" : cur,
    });
  }
  return out;
}

/**
 * Парсит все позиции (`<li class="menu-item">`) из HTML страницы/секции меню.
 * Чистая функция (без сети). menuId/menuName проставляются переданными значениями (контекст секции).
 */
export function parseVenueMenuItems(html: string, menuId = "", menuName = ""): VenueMenuItem[] {
  const out: VenueMenuItem[] = [];
  // блоки позиций: <li class="menu-item" …> … (до следующего menu-item или конца списка)
  const blocks = html.split(/<li class="menu-item"/).slice(1);
  for (const blk of blocks) {
    const beerM = /href="\/b\/([a-z0-9-]+)\/(\d+)"[^>]*>([\s\S]*?)<\/a>/.exec(blk);
    if (!beerM) continue;
    const bid = Number(beerM[2]);
    // имя сорта: внутренний текст ссылки, без ведущего «N.» (порядковый номер в меню)
    const name = decode(beerM[3] ?? "").replace(/^\d+\.\s*/, "");
    const styleRaw = decode(/<em>([\s\S]*?)<\/em>/.exec(blk)?.[1] ?? "");
    const brewM = /href="\/w\/([a-z0-9-]+)\/(\d+)"[^>]*>([\s\S]*?)<\/a>/.exec(blk);
    const abv = num(/([\d.,]+)%\s*ABV/i.exec(blk)?.[1]);
    const ibu = num(/([\d.,]+)\s*IBU/i.exec(blk)?.[1]);
    const rating = num(/data-rating="([\d.]+)"/.exec(blk)?.[1]);
    // обложка из .beer-label (первый <img> после открытия блока этикетки)
    const imgM = /class="beer-label">[\s\S]*?<img[^>]+src="([^"]+)"/.exec(blk)?.[1] ?? null;
    out.push({
      bid,
      name,
      beerSlug: beerM[1]!,
      url: `${BASE}/b/${beerM[1]}/${bid}`,
      styleRaw,
      abv,
      ibu,
      rating,
      breweryId: brewM ? Number(brewM[2]) : null,
      breweryName: brewM ? decode(brewM[3] ?? "") : null,
      brewerySlug: brewM ? brewM[1]! : null,
      imageUrl: imgM ? abs(imgM) : null,
      prices: parsePrices(blk, menuName),
      menuId,
      menuName,
    });
  }
  return out;
}

function abs(u: string): string {
  if (u.startsWith("//")) return `https:${u}`;
  if (u.startsWith("http")) return u;
  return u.startsWith("/") ? `${BASE}${u}` : `https://${u}`;
}

// ── сетевой обход ──────────────────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Обходит ВСЕ меню-секции венью и собирает позиции с провенансом.
 * Базовая страница рендерит первое меню; остальные тянутся как `?menu_id=<id>`. Дедуп по (bid+menuId)
 * внутри меню (одна позиция = одно вхождение в меню; в разных меню сорт может повторяться легитимно).
 * onlyMenus (опц.) — ограничить набор menu_id (для дешёвой пере-проверки одной секции).
 */
export async function fetchVenueMenus(
  slug: string,
  venueId: string,
  opts: { onlyMenus?: string[]; probeOnly?: boolean } = {},
): Promise<VenueMenusResult | null> {
  const baseUrl = `${BASE}/v/${slug}/${venueId}`;
  const baseHtml = await fetchHtml(baseUrl);
  if (!baseHtml) return null;

  const meta = parseVenueMeta(baseHtml, slug, venueId);
  const menus = parseVenueMenuSelector(baseHtml);
  const roster = parseVenueRoster(baseHtml);
  const nearby = parseNearbyVenues(baseHtml, venueId);

  // лёгкий зонд дискавери (TASK-37): только базовая страница — не обходим все секции меню.
  // hasMenu по селектору/ростеру/наличию menu-item; items не наполняем (дорого), кроме видимых.
  if (opts.probeOnly) {
    const baseItems = parseVenueMenuItems(baseHtml, menus[0]?.menuId ?? "", menus[0]?.name ?? meta.name);
    const hasMenu = menus.length > 0 || roster.length > 0 || baseItems.length > 0;
    return { meta, menus, items: baseItems, roster, updatedAt: parseVenueMenuUpdatedAt(baseHtml), nearby, hasMenu };
  }

  const items: VenueMenuItem[] = [];
  const updatedTimes: string[] = [];
  const pushUpdated = (h: string) => {
    const u = parseVenueMenuUpdatedAt(h);
    if (u) updatedTimes.push(u);
  };
  pushUpdated(baseHtml);

  const wanted = opts.onlyMenus ? menus.filter((m) => opts.onlyMenus!.includes(m.menuId)) : menus;

  if (menus.length === 0) {
    // одно (безымянное) меню или его нет — берём позиции прямо с базовой страницы
    items.push(...parseVenueMenuItems(baseHtml, "", meta.name));
  } else {
    // базовая страница уже отрендерила ПЕРВОЕ меню селектора — не фетчим его повторно
    const first = wanted[0];
    if (first && (!opts.onlyMenus || opts.onlyMenus.includes(first.menuId))) {
      const firstItems = parseVenueMenuItems(baseHtml, first.menuId, first.name);
      // подстраховка: если базовая страница не отрендерила позиций первого меню — дотянем по menu_id
      if (firstItems.length === 0) {
        await sleep(MENU_DELAY_MS + Math.floor(Math.random() * MENU_JITTER_MS));
        const h = await fetchHtml(`${baseUrl}?menu_id=${first.menuId}`);
        if (h) { pushUpdated(h); items.push(...dedupByBid(parseVenueMenuItems(h, first.menuId, first.name))); }
      } else {
        items.push(...dedupByBid(firstItems));
      }
    }
    for (const m of wanted.slice(opts.onlyMenus ? 0 : 1)) {
      if (opts.onlyMenus && m.menuId === first?.menuId) continue;
      await sleep(MENU_DELAY_MS + Math.floor(Math.random() * MENU_JITTER_MS));
      const h = await fetchHtml(`${baseUrl}?menu_id=${m.menuId}`);
      if (!h) continue;
      pushUpdated(h);
      items.push(...dedupByBid(parseVenueMenuItems(h, m.menuId, m.name)));
    }
  }

  const hasMenu = items.length > 0 || roster.length > 0;
  const updatedAt = updatedTimes.sort().at(-1) ?? null;
  return { meta, menus, items, roster, updatedAt, nearby, hasMenu };
}

/** Дедуп позиций одного меню по bid (в одном меню сорт указан один раз). */
function dedupByBid(items: VenueMenuItem[]): VenueMenuItem[] {
  const seen = new Set<number>();
  const out: VenueMenuItem[] = [];
  for (const it of items) {
    if (seen.has(it.bid)) continue;
    seen.add(it.bid);
    out.push(it);
  }
  return out;
}
