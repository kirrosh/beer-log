// Сид-парсер реестра russiancraftbeer.ru (страница /export или /list).
// Пивоварни: из /brewery/-ссылок и из строк «ассортимент» на карточках заведений.
// Заведения: /place/. Сорта: /style/-ссылки + следующая строка со стилем.

export interface RcbBrewery { name: string; url?: string; }
export interface RcbVenue { name: string; url?: string; }
export interface RcbBeer { name: string; styleRaw: string; }
export interface RcbParseResult {
  breweries: string[];          // уникальные имена пивоварен (ссылки + ассортимент)
  breweryLinks: RcbBrewery[];   // явные /brewery/ ссылки
  venues: RcbVenue[];           // заведения (/place/)
  beers: RcbBeer[];             // сорта (/style/) с сырым стилем
}

const BREWERY_LINK_RE = /\[([^\]]+)\]\((https?:\/\/russiancraftbeer\.ru\/brewery\/[^\)]+)\)/g;
const PLACE_LINK_RE = /\[([^\]]+)\]\((https?:\/\/russiancraftbeer\.ru\/place\/[^\)]+)\)/g;
const STYLE_RE = /\[([^\]]+)\]\(https?:\/\/russiancraftbeer\.ru\/style\/[^\)]+\)\s*([A-Za-zА-Яа-яЁё][^\n]*)/g;
// строка-перечисление пивоварен между POINT(...) и маркером custom#
const SERVED_RE = /POINT \([^)]*\)\s*([^\n][^\n]*)\n\s*\ncustom#/g;

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function looksLikeBreweryName(s: string): boolean {
  const t = s.trim();
  if (t.length < 2 || t.length > 48) return false;
  if (/https?:|@|\+7|\d{5,}/.test(t)) return false; // телефоны/URL, но не «1516 Brewery»
  if (!/[A-Za-zА-Яа-яЁё]/.test(t)) return false;
  return true;
}

export function parseRcbExport(html: string): RcbParseResult {
  const breweryLinks: RcbBrewery[] = [];
  const venues: RcbVenue[] = [];
  const beers: RcbBeer[] = [];
  const names = new Set<string>();

  let m: RegExpExecArray | null;

  BREWERY_LINK_RE.lastIndex = 0;
  while ((m = BREWERY_LINK_RE.exec(html)) !== null) {
    const name = clean(m[1] ?? "");
    if (name) { breweryLinks.push({ name, url: m[2] }); names.add(name); }
  }

  PLACE_LINK_RE.lastIndex = 0;
  while ((m = PLACE_LINK_RE.exec(html)) !== null) {
    const name = clean(m[1] ?? "");
    if (name) venues.push({ name, url: m[2] });
  }

  STYLE_RE.lastIndex = 0;
  while ((m = STYLE_RE.exec(html)) !== null) {
    const name = clean(m[1] ?? "");
    const styleRaw = clean(m[2] ?? "");
    if (name && styleRaw && !styleRaw.startsWith("#")) beers.push({ name, styleRaw });
  }

  SERVED_RE.lastIndex = 0;
  while ((m = SERVED_RE.exec(html)) !== null) {
    const line = clean(m[1] ?? "");
    if (!line || line.startsWith("custom#")) continue;
    for (const part of line.split(",")) {
      const name = clean(part);
      if (looksLikeBreweryName(name)) names.add(name);
    }
  }

  return { breweries: [...names], breweryLinks, venues, beers };
}
