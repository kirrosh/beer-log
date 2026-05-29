import type { BeerStyle, BeerStyleCategory } from "./models.ts";

/**
 * Unicode-aware «граница слова». JS `\b` опирается на ASCII `\w`, поэтому
 * `\bлагер\b` НЕ матчит кириллицу. Здесь — lookaround по \p{L}/\p{N} с флагом u.
 */
function w(core: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${core})(?![\\p{L}\\p{N}])`, "iu");
}

interface StyleRule {
  slug: string;
  name: string;
  category: BeerStyleCategory;
  patterns: RegExp[];
}

// Порядок важен: более специфичные стили — выше.
const STYLE_RULES: StyleRule[] = [
  { slug: "neipa", name: "New England IPA", category: "ipa",
    patterns: [w("ne-?ipa|new england ipa|хейзи|hazy ipa")] },
  { slug: "dipa", name: "Double IPA", category: "ipa",
    patterns: [w("d-?ipa|double ipa|imperial ipa|дипа")] },
  { slug: "ipa", name: "IPA", category: "ipa",
    patterns: [w("ipa|ипа")] },
  { slug: "apa", name: "American Pale Ale", category: "pale-ale",
    patterns: [w("apa|pale ale|пэйл[\\s-]?эль")] },
  { slug: "imperial-stout", name: "Imperial Stout", category: "stout-porter",
    patterns: [w("imperial stout|ris|империал[\\s-]?стаут")] },
  { slug: "stout", name: "Stout", category: "stout-porter",
    patterns: [w("stout|стаут")] },
  { slug: "porter", name: "Porter", category: "stout-porter",
    patterns: [w("porter|портер")] },
  { slug: "gose", name: "Gose", category: "sour-wild",
    patterns: [w("gose|гозе")] },
  { slug: "sour", name: "Sour", category: "sour-wild",
    patterns: [w("sour|сауэр|кисляк|berliner weisse")] },
  { slug: "wheat", name: "Wheat / Witbier", category: "wheat",
    patterns: [w("wit|witbier|weizen|пшеничн\\p{L}*")] },
  { slug: "lager", name: "Lager", category: "lager",
    patterns: [w("lager|лагер|pilsner|пилс\\p{L}*|helles")] },
  { slug: "saison", name: "Saison", category: "belgian",
    patterns: [w("saison|сезон")] },
  { slug: "barleywine", name: "Barley Wine", category: "specialty",
    patterns: [w("barley\\s?wine|барливайн")] },
  { slug: "cider", name: "Cider", category: "non-beer",
    patterns: [w("cider|сидр")] },
  { slug: "mead", name: "Mead", category: "non-beer",
    patterns: [w("mead|мид|медовух\\p{L}*")] },
];

export function categorizeStyle(text: string): BeerStyle {
  for (const rule of STYLE_RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return { slug: rule.slug, name: rule.name, category: rule.category, raw: text.trim() };
    }
  }
  return { slug: "unknown", name: "Unknown", category: "unknown", raw: text.trim() };
}

export const KNOWN_STYLES = STYLE_RULES.map(({ slug, name, category }) => ({ slug, name, category }));
