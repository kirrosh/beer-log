import type { Beer, PriceListing, SourceRef } from "@beer-log/catalog-core";
import { categorizeStyle, slugify } from "@beer-log/catalog-core";

// без завершающего \b: ₽/«руб»/«б» не образуют ASCII word-boundary в конце строки
const PRICE_RE = /(\d[\d\s]{0,7})\s?(?:₽|руб\.?|р\.|rub)/i;
const ABV_RE = /(\d{1,2}(?:[.,]\d)?)\s?%/;
const VOLUME_RE = /(\d{2,4})\s?(?:мл|ml)\b/i;

export interface ExtractResult {
  beers: Partial<Beer>[];
  listings: PriceListing[];
}

function guessName(line: string): string {
  return line
    .replace(PRICE_RE, "")
    .replace(VOLUME_RE, "")
    .replace(ABV_RE, "")
    .replace(/[•★▪|]+/g, " ")
    .replace(/\s[—–-]\s/g, " ")
    .replace(/(?:\s*,\s*){2,}/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,–—-]+|[\s,–—-]+$/g, "")
    .slice(0, 80)
    .trim();
}

function guessFormat(line: string): PriceListing["format"] {
  // без \b — он не работает с кириллицей; используем \p{L}-границу через (?<![\p{L}])
  if (/(?<![\p{L}])(?:кег|keg)/iu.test(line)) return "keg";
  if (/(?<![\p{L}])(?:бан(?:ка|ке|ок)|can)/iu.test(line)) return "can";
  if (/(?<![\p{L}])(?:бутыл|bottle)/iu.test(line)) return "bottle";
  if (/(?<![\p{L}])(?:разлив|draft|draught)/iu.test(line)) return "draft";
  return "unknown";
}

/**
 * Эвристический экстрактор: бьёт сообщение на строки и пытается вытащить
 * из каждой пиво (название/стиль/ABV) и/или ценовое предложение.
 * Прототип Фазы 0 — что не распозналось, уходит в unparsed на ревью.
 */
export function extractFromMessage(text: string, ref: SourceRef): ExtractResult {
  const beers: Partial<Beer>[] = [];
  const listings: PriceListing[] = [];
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  let idx = 0;
  for (const line of lines) {
    const abvM = line.match(ABV_RE);
    const priceM = line.match(PRICE_RE);
    const volM = line.match(VOLUME_RE);
    const style = categorizeStyle(line);
    const looksLikeBeer = style.category !== "unknown" || abvM !== null;
    if (!looksLikeBeer && priceM === null) continue;

    const name = guessName(line);
    const now = ref.seenAt;

    if (looksLikeBeer && name.length >= 2) {
      beers.push({
        name,
        slug: slugify(name),
        style: style.category !== "unknown" ? style : undefined,
        abv: abvM ? parseFloat(abvM[1]!.replace(",", ".")) : undefined,
        aliases: [],
        sources: [{ ...ref, excerpt: line }],
        status: "auto",
      });
    }

    if (priceM) {
      listings.push({
        id: `${ref.sourceId ?? "src"}:${now}:${idx}`,
        beerNameRaw: name || line,
        price: parseInt(priceM[1]!.replace(/\s/g, ""), 10),
        currency: "RUB",
        volumeMl: volM ? parseInt(volM[1]!, 10) : undefined,
        format: guessFormat(line),
        source: { ...ref, excerpt: line },
        seenAt: now,
      });
    }
    idx++;
  }

  return { beers, listings };
}
