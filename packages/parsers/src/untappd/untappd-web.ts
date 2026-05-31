import type { Beer, PriceListing, Source } from "@beer-log/catalog-core";
import { categorizeStyle } from "@beer-log/catalog-core";
import type { Parser, ParseResult, ParserHealth } from "../types.ts";
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
 * Парсит HTML страницы списка сортов пивоварни Untappd (`/beer`).
 * Чистая функция (без сети) — основа для теста/самопроверки разметки.
 */
export function parseUntappdBeerList(html: string): UntappdBeer[] {
  const out: UntappdBeer[] = [];
  // блоки сортов: <div class="beer-item " data-bid="…">…
  const blocks = html.split(/<div class="beer-item "/).slice(1);
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

export const untappdWebParser: Parser = {
  id: "untappd-web",
  description:
    "Парсит публичную страницу списка сортов пивоварни Untappd (untappd.com/<brewery>/beer). " +
    "Достаёт имя, стиль, ABV, IBU, описание. Структурированный источник для пивоварен без " +
    "читаемого офиц. TG (дрейф-каналы, без TG). Ломается, если Untappd изменит .beer-item — см. healthCheck.",

  async parse(target: string): Promise<ParseResult> {
    const url = toBeerListUrl(target);
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new ParserDriftError("untappd-web", `HTTP ${res.status} для ${url}`);
    const html = await res.text();
    const items = parseUntappdBeerList(html);
    if (items.length === 0 && html.includes("beer-item")) {
      throw new ParserDriftError(
        "untappd-web",
        "блоки .beer-item в HTML есть, но распарсилось 0 — вероятно изменилась разметка",
      );
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
    return { source, beers, listings, unparsed: [], fetchedAt };
  },

  async healthCheck(target: string): Promise<ParserHealth> {
    try {
      const r = await this.parse(target);
      const itemsExtracted = r.beers.length;
      return {
        ok: itemsExtracted > 0,
        itemsSeen: itemsExtracted,
        itemsExtracted,
        errors: itemsExtracted === 0 ? ["извлечено 0 сортов — разметка Untappd поплыла"] : [],
      };
    } catch (e) {
      return { ok: false, itemsSeen: 0, itemsExtracted: 0, errors: [String(e)] };
    }
  },
};
