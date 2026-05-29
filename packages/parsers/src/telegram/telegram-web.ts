import type { Beer, PriceListing, Source } from "@beer-log/catalog-core";
import type { Parser, ParseResult, ParserHealth } from "../types.ts";
import { ParserDriftError } from "../types.ts";
import { extractFromMessage } from "./extract.ts";

const MSG_TEXT_RE = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g;

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/** Извлекает тексты сообщений из HTML публичного превью t.me/s/<channel>. */
export function parseChannelHtml(html: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  MSG_TEXT_RE.lastIndex = 0;
  while ((m = MSG_TEXT_RE.exec(html)) !== null) {
    const text = stripHtml(m[1] ?? "");
    if (text) out.push(text);
  }
  return out;
}

function channelToUrl(target: string): { handle: string; url: string } {
  const raw = target
    .replace(/^@/, "")
    .replace(/^https?:\/\/t\.me\/(s\/)?/, "")
    .replace(/\/.*$/, "");
  return { handle: `@${raw}`, url: `https://t.me/s/${raw}` };
}

export const telegramWebParser: Parser = {
  id: "telegram-web",
  description:
    "Парсит публичное веб-превью Telegram-канала (t.me/s/<channel>). " +
    "Достаёт тексты сообщений и прогоняет извлечение пива/цен. API-ключ не нужен. " +
    "Ломается, если Telegram изменит разметку .tgme_widget_message_text — см. healthCheck.",

  async parse(target: string): Promise<ParseResult> {
    const { handle, url } = channelToUrl(target);
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; beer-log/0.1; +https://beer-log)" },
    });
    if (!res.ok) throw new ParserDriftError("telegram-web", `HTTP ${res.status} для ${url}`);
    const html = await res.text();
    const messages = parseChannelHtml(html);
    if (messages.length === 0 && html.includes("tgme_widget_message")) {
      throw new ParserDriftError(
        "telegram-web",
        "сообщения в HTML есть, но текстовый regex нашёл 0 — вероятно изменилась разметка",
      );
    }

    const fetchedAt = new Date().toISOString();
    const source: Source = { id: handle, kind: "telegram", handle, url, active: true };
    const beers: Partial<Beer>[] = [];
    const listings: PriceListing[] = [];
    const unparsed: { text: string; reason: string }[] = [];

    for (const text of messages) {
      const extracted = extractFromMessage(text, {
        sourceId: handle,
        kind: "telegram",
        url,
        seenAt: fetchedAt,
      });
      if (extracted.beers.length === 0 && extracted.listings.length === 0) {
        unparsed.push({ text, reason: "не сработал ни один паттерн пива/цены" });
      }
      beers.push(...extracted.beers);
      listings.push(...extracted.listings);
    }

    return { source, beers, listings, unparsed, fetchedAt };
  },

  async healthCheck(target: string): Promise<ParserHealth> {
    try {
      const r = await this.parse(target);
      const itemsExtracted = r.beers.length + r.listings.length;
      const itemsSeen = itemsExtracted + r.unparsed.length;
      return {
        ok: itemsExtracted > 0,
        itemsSeen,
        itemsExtracted,
        errors: itemsExtracted === 0 ? ["извлечено 0 элементов — экстрактор или разметка поплыли"] : [],
      };
    } catch (e) {
      return { ok: false, itemsSeen: 0, itemsExtracted: 0, errors: [String(e)] };
    }
  },
};
