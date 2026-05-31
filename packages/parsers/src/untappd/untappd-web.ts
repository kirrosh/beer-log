import type { Beer, PriceListing, Source } from "@beer-log/catalog-core";
import { categorizeStyle } from "@beer-log/catalog-core";
import type { Parser, ParseOptions, ParseResult, ParserHealth } from "../types.ts";
import { ParserDriftError } from "../types.ts";

/** Один сорт со страницы пивоварни Untappd (untappd.com/<brewery>/beer). */
export interface UntappdBeer {
  /** Untappd beer id (data-bid) */
  bid: number;
  name: string;
  /** абсолютный URL карточки сорта на Untappd */
  url: string;
  /** исходная метка стиля, напр. "IPA - American" */
  styleRaw: string;
  abv: number | null;
  ibu: number | null;
  /** описание из карточки (без «Read More»-хвоста), может отсутствовать */
  description: string | null;
}

const BASE = "https://untappd.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// Пагинация Untappd (more_beer) с 2026 закрыта за логином — нужна cookie авторизованной сессии.
const COOKIE_FILE = "data/.secrets/untappd-cookie.txt"; // gitignored; см. data/.secrets/README.md
// Анти-бан: бьём по чужому сайту авторизованной сессией — рейт-лимит обязателен. Пауза между
// запросами догрузки = база + джиттер (рваный ритм меньше похож на бота, чем ровный пулемёт).
const PAGE_DELAY_MS = 1500; // базовая пауза между more_beer
const PAGE_JITTER_MS = 1500; // + случайная добавка [0..JITTER], итого ~1.5–3.0с/страница
const MAX_PAGES = 80; // предохранитель: 80×25 = 2000 сортов потолок (крупнейшая ~530)

/** Cookie сессии: явный аргумент → env UNTAPPD_COOKIE → файл data/.secrets/untappd-cookie.txt. */
function loadUntappdCookie(explicit?: string): string | null {
  if (explicit?.trim()) return explicit.trim();
  const env = process.env.UNTAPPD_COOKIE?.trim();
  if (env) return env;
  try {
    // node:fs доступен в Bun; читаем синхронно — вызывается один раз на ингест пивоварни
    const fs = require("node:fs") as typeof import("node:fs");
    const raw = fs.readFileSync(COOKIE_FILE, "utf8").trim();
    return raw || null;
  } catch {
    return null;
  }
}

/** Путь AJAX-догрузки сортов из inline-JS страницы: `_apiReqsUrl = "/brewery/more_beer/<id>"`. */
export function parseUntappdMoreBeerPath(html: string): string | null {
  return /_apiReqsUrl\s*=\s*"(\/brewery\/more_beer\/\d+)"/.exec(html)?.[1] ?? null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function unescapeHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#8230;/g, "…")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function num(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Извлекает заявленное число сортов пивоварни из заголовка профиля Untappd («216 Beers» / «0 Beer»).
 * Это ИСТИННЫЙ тотал каталога пивоварни, даже если в SSR-списке отдано лишь первые ~25
 * (остальное Untappd с 2026 прячет за логином — см. healthCheck/`ok-untappd-partial`).
 * Берём первое вхождение — счётчик самой пивоварни идёт в шапке профиля раньше сайдбара.
 * `null`, если метки нет (разметка поплыла / нестандартная страница).
 */
export function parseUntappdBeerTotal(html: string): number | null {
  const m = /<a[^>]*>\s*([\d,]+)\s+Beers?\s*<\/a>/.exec(html);
  if (!m) return null;
  const n = Number(m[1]!.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Парсит HTML страницы списка сортов пивоварни Untappd (`/beer`).
 * Чистая функция (без сети) — основа для теста/самопроверки разметки.
 */
export function parseUntappdBeerList(html: string): UntappdBeer[] {
  const out: UntappdBeer[] = [];
  // блоки сортов: первая (SSR) страница — `<div class="beer-item " data-bid=…>`, а фрагменты
  // авторизованной догрузки more_beer — `<div class="beer-item" data-bid=…>` (без хвостового
  // пробела). Опциональный пробел в классе ловит обе формы.
  const blocks = html.split(/<div class="beer-item ?"/).slice(1);
  for (const blk of blocks) {
    const bid = num(/^\s*data-bid="(\d+)"/.exec(blk)?.[1] ?? undefined);
    const nameM = /class="name"><a[^>]*href="([^"]+)"[^>]*>([^<]+)</.exec(blk);
    const styleRaw = unescapeHtml(/class="style"[^>]*>([^<]+)</.exec(blk)?.[1] ?? "");
    if (bid === null || !nameM || !styleRaw) continue; // не сорт / поплыла разметка
    const abv = num(/details-item abv">\s*([\d.,]+)%/.exec(blk)?.[1] ?? undefined);
    const ibu = num(/details-item ibu">\s*([\d.,]+)\s*IBU/.exec(blk)?.[1] ?? undefined);
    const descRaw = /class="desc[^"]*"[^>]*>([\s\S]*?)<a[^>]*class="[^"]*read-more/.exec(blk)?.[1]
      ?? /class="desc[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(blk)?.[1];
    const description = descRaw ? unescapeHtml(descRaw) || null : null;
    out.push({
      bid,
      name: unescapeHtml(nameM[2] ?? ""),
      url: nameM[1]!.startsWith("http") ? nameM[1]! : BASE + nameM[1],
      styleRaw,
      abv,
      ibu,
      description,
    });
  }
  return out;
}

/**
 * Классифицирует цель как URL списка сортов пивоварни Untappd (`…/beer`) — ЕДИНЫЙ источник
 * правды о том, ingestable ли источник. Используется и парсером (`parse` бросает по `reason`),
 * и трекером (`pipeline-status` считает untappd-источник ingestable только если `ok`).
 *
 * `ok:true` → нормализованный `…/beer`-URL для: голого slug (`JawsBrew`), `untappd.com/JawsBrew`,
 * профиль-URL, формы `/w/<slug>/<brewery-id>` и уже готового `…/beer`.
 * `ok:false` (НЕ ingestable, нужен ре-ресёрч/blocked):
 *  - не-untappd.com хост (зеркала вроде your.beer) — парсер их не читает;
 *  - venue-URL `/v/<slug>/<id>` — это бар/заведение, его меню = чужие сорта (молчаливо-неверные данные);
 *  - неполная форма `/w/<slug>` без числового brewery-id — beer-list собрать нельзя (404).
 */
export function classifyUntappdBeerListUrl(target: string): { ok: true; url: string } | { ok: false; reason: string } {
  if (/^https?:\/\//.test(target)) {
    const u = new URL(target);
    if (u.hostname.replace(/^www\./, "") !== "untappd.com")
      return { ok: false, reason: `не-untappd.com источник (${u.hostname}) — парсер untappd-web его не читает` };
    const path = u.pathname.replace(/\/+$/, "");
    if (/^\/v\//.test(path))
      return { ok: false, reason: `venue-URL (не список сортов пивоварни) — нужен профиль или /w/<slug>/<brewery-id>` };
    // /w/<slug> без числового id — beer-list не построить (нужен /w/<slug>/<id>)
    if (/^\/w\/[^/]+$/.test(path))
      return { ok: false, reason: `неполный /w/ URL без brewery-id — нужен /w/<slug>/<brewery-id>` };
    return { ok: true, url: `${BASE}${path.endsWith("/beer") ? path : `${path}/beer`}` };
  }
  // голый slug или "untappd.com/<slug>" — отрезаем хвост после первого сегмента
  const slug = target.replace(/^@/, "").replace(/^untappd\.com\//, "").replace(/\/.*$/, "");
  if (!slug) return { ok: false, reason: `пустой untappd-таргет: ${target}` };
  return { ok: true, url: `${BASE}/${slug}/beer` };
}

/** Нормализует цель в `…/beer`-URL; бросает ParserDriftError для не-ingestable источников. */
function toBeerListUrl(target: string): string {
  const c = classifyUntappdBeerListUrl(target);
  if (!c.ok) throw new ParserDriftError("untappd-web", `${c.reason}: ${target}`);
  return c.url;
}

/**
 * Дочитывает сорта СВЕРХ первой страницы через авторизованный AJAX-эндпойнт `more_beer`.
 * Возвращает только догруженные блоки (без первых ~25 из SSR). Дедуп по bid, пауза между
 * запросами (PAGE_DELAY_MS) и предохранитель MAX_PAGES. `offset` = число уже отрендеренных
 * `.beer-item` — ровно как считает сам Untappd (см. sorting.js: `_apiReqsUrl + "/" + count`).
 * stopped: причина останова (exhausted / reached-total / empty-page / no-new / http-NNN / max-pages)
 * — для диагностики; `empty-page` сразу на первой догрузке при total>25 обычно значит протухшую cookie.
 */
async function fetchMoreBeerPages(
  morePath: string,
  cookie: string,
  referer: string,
  firstPageCount: number,
  totalAvailable: number | null,
): Promise<{ beers: UntappdBeer[]; pages: number; stopped: string }> {
  const out: UntappdBeer[] = [];
  const seen = new Set<number>();
  let offset = firstPageCount;
  let pages = 0;
  let stopped = "exhausted";
  for (; pages < MAX_PAGES; pages++) {
    if (totalAvailable != null && offset >= totalAvailable) {
      stopped = "reached-total";
      break;
    }
    await sleep(PAGE_DELAY_MS + Math.floor(Math.random() * PAGE_JITTER_MS));
    const res = await fetch(`${BASE}${morePath}/${offset}`, {
      headers: { "User-Agent": UA, Cookie: cookie, "X-Requested-With": "XMLHttpRequest", Referer: referer },
    });
    if (!res.ok) {
      stopped = `http-${res.status}`;
      break;
    }
    const items = parseUntappdBeerList(await res.text());
    if (items.length === 0) {
      stopped = "empty-page";
      break;
    }
    let added = 0;
    for (const it of items) {
      if (seen.has(it.bid)) continue;
      seen.add(it.bid);
      out.push(it);
      added++;
    }
    offset += items.length;
    if (added === 0) {
      stopped = "no-new"; // гейт отдал дубликаты — защита от зацикливания
      break;
    }
  }
  if (pages >= MAX_PAGES) stopped = "max-pages";
  return { beers: out, pages, stopped };
}

export const untappdWebParser: Parser = {
  id: "untappd-web",
  description:
    "Парсит публичную страницу списка сортов пивоварни Untappd (untappd.com/<brewery>/beer). " +
    "Достаёт имя, стиль, ABV, IBU, описание. Структурированный источник для пивоварен без " +
    "читаемого офиц. TG (дрейф-каналы, без TG). Ломается, если Untappd изменит .beer-item — см. healthCheck.",

  async parse(target: string, opts?: ParseOptions): Promise<ParseResult> {
    const url = toBeerListUrl(target);
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new ParserDriftError("untappd-web", `HTTP ${res.status} для ${url}`);
    const html = await res.text();
    const items = parseUntappdBeerList(html);
    const totalAvailable = parseUntappdBeerTotal(html);
    // Дрейф разметки vs. легитимно пустая пивоварня: раньше бросали по факту строки "beer-item"
    // в HTML, но она есть и в JS-шаблоне (#menu-template) у пивоварен с «0 Beer» — ложный дрейф.
    // Теперь решаем по истинному тоталу из шапки: 0 → пусто (норма); >0, но 0 реальных
    // data-bid-блоков → разметка действительно поплыла.
    if (items.length === 0 && (totalAvailable === null || totalAvailable > 0) && /data-bid="\d+"/.test(html)) {
      throw new ParserDriftError(
        "untappd-web",
        `0 сортов распарсилось при ${totalAvailable ?? "?"} заявленных и наличии data-bid — изменилась разметка .beer-item`,
      );
    }

    // Догрузка за первую страницу (опц.): нужна авторизованная сессия — anonymous more_beer пуст.
    const firstPageCount = items.length;
    if (opts?.paginate && firstPageCount > 0 && (totalAvailable === null || totalAvailable > firstPageCount)) {
      const cookie = loadUntappdCookie(opts.cookie);
      const morePath = parseUntappdMoreBeerPath(html);
      if (cookie && morePath) {
        const more = await fetchMoreBeerPages(morePath, cookie, url, firstPageCount, totalAvailable);
        const seen = new Set(items.map((b) => b.bid));
        for (const b of more.beers) if (!seen.has(b.bid)) items.push(b);
        // Протухшая cookie / гейт: догрузка пуста, ХОТЯ первая страница упёрлась в потолок (~25) —
        // значит остаток реально есть, но не отдался. Если же первая страница < 25, пустой more_beer
        // — это просто исчерпание (всё было на одной странице), не повод падать и терять данные.
        if (more.beers.length === 0 && more.stopped === "empty-page" && firstPageCount >= 25) {
          throw new ParserDriftError(
            "untappd-web",
            `пагинация дала 0 при ${totalAvailable} заявленных и полной первой странице — вероятно cookie сессии Untappd протухла/невалидна`,
          );
        }
      }
    }

    const fetchedAt = new Date().toISOString();
    const handle = new URL(url).pathname.split("/").filter(Boolean)[0] ?? "untappd";
    const source: Source = { id: `untappd:${handle}`, kind: "website", handle, url, active: true };

    const beers: Partial<Beer>[] = items.map((b) => {
      const st = categorizeStyle(b.styleRaw);
      return {
        name: b.name,
        abv: b.abv ?? undefined,
        ibu: b.ibu ?? undefined,
        style: { slug: st.slug, name: b.styleRaw, category: st.category, raw: b.styleRaw },
      };
    });
    const listings: PriceListing[] = [];
    return { source, beers, listings, unparsed: [], fetchedAt, totalAvailable };
  },

  async healthCheck(target: string): Promise<ParserHealth> {
    try {
      const r = await this.parse(target);
      const itemsExtracted = r.beers.length;
      // itemsSeen = ИСТИННЫЙ тотал из шапки (а не 25-потолок): так дрейф не маскируется потолком.
      // Здоров, если извлекли >0 ЛИБО пивоварня легитимно пустая (тотал 0). Недобор из-за
      // логин-гейта Untappd (extracted < seen) — НЕ ошибка парсера, это потолок анонимного доступа.
      const itemsSeen = r.totalAvailable ?? itemsExtracted;
      const ok = itemsExtracted > 0 || r.totalAvailable === 0;
      const errors: string[] = [];
      if (!ok) errors.push(`извлечено 0 сортов при ${itemsSeen} заявленных — разметка Untappd поплыла`);
      return { ok, itemsSeen, itemsExtracted, errors };
    } catch (e) {
      return { ok: false, itemsSeen: 0, itemsExtracted: 0, errors: [String(e)] };
    }
  },
};
