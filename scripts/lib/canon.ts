// canon.ts — канон-слой «что маст-трай» (TASK-52, M5). Глобальная ось «канонично» (известность как
// ФАКТ, не оценка) — отдельно от «под мой вкус» (tastings) и от «топ НА ТОЧКЕ» (highlights, который
// станет производной от канона). Источник правды — data/personal/canon.json, правит агент/скрипты.
//
// Три типа каноничности:
//   brewery-flagship — визитка пивоварни («если у Jaws пробовать одно — что»);
//   style-benchmark  — эталон стиля, доступный в РФ («понять, что такое гозе»);
//   ru-classic       — знаковые сорта российского крафта (долгосрочный чеклист).
// Наполнение честное: distribution (число продавцов, TASK-52), checkins (Untappd, TASK-59),
// research (курация эталонов/классики, TASK-53/60).
import { readFileSync, writeFileSync, existsSync } from "node:fs";

export type CanonType = "brewery-flagship" | "style-benchmark" | "ru-classic";
export type CanonBasis = "distribution" | "checkins" | "research";

export type CanonEntry = {
  beerId: string | null;  // id из beers; null если сорт ещё не в каталоге (кандидат в discovery)
  beer: string;           // человекочитаемое «Пивоварня Сорт»
  canonType: CanonType;
  basis: CanonBasis;      // на чём основана каноничность
  basisNote: string;      // обоснование одной фразой («самый широко распределённый сорт пивоварни»)
  note?: string;          // опц. редакторская заметка
  addedAt: string;        // дата YYYY-MM-DD
};

const CANON_KEY_ORDER: (keyof CanonEntry)[] = [
  "beerId", "beer", "canonType", "basis", "basisNote", "note", "addedAt",
];

const DEFAULT_SCHEMA = {
  what: "Канон-слой «что маст-трай» — ось «канонично» (известность как факт, не оценка). Отдельно от tastings (личный вкус) и highlights (топ на точке; станет производной от канона). Правят агент/скрипты.",
  canonType: "brewery-flagship = визитка пивоварни | style-benchmark = эталон стиля в РФ | ru-classic = знаковый сорт рос. крафта",
  basis: "distribution = по числу продавцов (рыночный отбор) | checkins = по чекинам Untappd | research = курация (эталоны/классика)",
  fields: {
    beerId: "id из beers; null если сорта ещё нет в каталоге → кандидат в discovery (заполнить beer)",
    beer: "человекочитаемое «Пивоварня Сорт»",
    canonType: "brewery-flagship | style-benchmark | ru-classic",
    basis: "distribution | checkins | research",
    basisNote: "обоснование каноничности одной фразой",
    note: "опц. редакторская заметка",
    addedAt: "дата YYYY-MM-DD",
  },
  note: "distribution-черновики визиток генерит scripts/canon-draft.ts; research/checkins-записи он НЕ перетирает (приоритет курации). Связь с highlights.json — точка наполняется из канона (см. data/personal/README.md).",
};

export type CanonFile = { schema: unknown; canon: CanonEntry[] };

/** Загрузить canon.json. Если файла нет — пустой канон с дефолтной схемой (создастся при сохранении). */
export function loadCanon(dir = "data/personal"): CanonFile {
  const path = `${dir}/canon.json`;
  if (!existsSync(path)) return { schema: DEFAULT_SCHEMA, canon: [] };
  const raw = JSON.parse(readFileSync(path, "utf8")) as { _schema?: unknown; canon?: CanonEntry[] };
  return { schema: raw._schema ?? DEFAULT_SCHEMA, canon: Array.isArray(raw.canon) ? raw.canon : [] };
}

/** Убрать пустые поля и зафиксировать порядок ключей (стабильный diff). */
function cleanEntry(e: CanonEntry): CanonEntry {
  const out: Record<string, unknown> = {};
  for (const k of CANON_KEY_ORDER) {
    const v = (e as Record<string, unknown>)[k];
    if (v === undefined || (v === null && k !== "beerId")) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    out[k] = v;
  }
  if (!("beerId" in out)) out.beerId = null;
  return out as CanonEntry;
}

/** Сериализация canon.json: _schema целиком, записи — по одной на строку (читаемый diff). */
export function saveCanon(file: CanonFile, dir = "data/personal"): void {
  const schemaJson = JSON.stringify(file.schema, null, 2).split("\n").join("\n  ");
  const body = file.canon.map((e) => `    ${JSON.stringify(cleanEntry(e))}`).join(",\n");
  const text = `{\n  "_schema": ${schemaJson},\n  "canon": [\n${body}\n  ]\n}\n`;
  writeFileSync(`${dir}/canon.json`, text);
}
