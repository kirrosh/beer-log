// Парсер релизов из официального TG-канала пивоварни (формат Rewort):
//   <Название>
//   <Стиль, напр. "IPA - New England / Hazy">
//   Алк X% / Plato Y% / IBU Z
//   <описание...>
export interface BreweryRelease {
  name: string;
  styleRaw: string;
  abv?: number;
  plato?: number;
  ibu?: number;
  description: string;
}

const ANCHOR = /Алк\s*([\d.,]+)\s*%\s*\/\s*Plato\s*([\d.,]+)\s*%?\s*\/\s*IBU\s*([\dNA/]+)/i;
const num = (s: string | undefined): number | undefined => {
  if (!s) return undefined;
  const v = parseFloat(s.replace(",", "."));
  return Number.isFinite(v) ? v : undefined;
};

export function parseBreweryReleases(text: string): BreweryRelease[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const out: BreweryRelease[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(ANCHOR);
    if (!m) continue;

    // две непустые строки выше: стиль и название
    const prev: string[] = [];
    for (let j = i - 1; j >= 0 && prev.length < 2; j--) {
      if (lines[j]) prev.push(lines[j]!);
    }
    if (prev.length < 2) continue;
    const styleRaw = prev[0]!;
    const name = prev[1]!;

    // описание: непустые строки ниже до хэштега/ссылки
    const desc: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j]!;
      if (!l) { if (desc.length) break; else continue; }
      if (/^#|^\[|^https?:|VIEW IN TELEGRAM|views/i.test(l)) break;
      desc.push(l);
    }

    out.push({
      name,
      styleRaw,
      abv: num(m[1]),
      plato: num(m[2]),
      ibu: m[3] && /^\d/.test(m[3]) ? num(m[3]) : undefined,
      description: desc.join(" ").trim(),
    });
  }
  return out;
}
