// Demand-driven кандидаты на канон (TASK-28 #1): агрегирует unmatched price_listings
// (beer_id IS NULL — matcher не нашёл пивоварню в каноне) по кандидат-бренду с частотой и
// охватом магазинов. Multi-shop бренд = сильный сигнал спроса (TASK-26): раз несколько
// бутлшопов возят — пивоварню стоит завести в канон (→ brewery-research → breadth-backfill).
//
// Извлечение бренда эвристично: берём латинскую часть после "/", срезаем тип/объём/формат,
// ключ = первые значимые токены. Не-пиво/импорт (#3) помечаем по типу-префиксу и словарю.
// Это разведданные для ручного завода (#2), не автоингест — список смотрит человек/агент.
//
// Запуск: bun run scripts/unmatched-brands.ts [minShops]   (по умолч. порог охвата = 2)
import { Database } from "bun:sqlite";
import { normalizeName } from "@beer-log/catalog-core";
import { buildMatcher } from "./lib/catalog-matcher.ts";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const MIN_SHOPS = Number(process.argv[2] ?? 2);
const db = new Database(DB_PATH, { readonly: true });
// matcher канона: отделяет «реально вне канона» (breweryId=null) от «пивоварня в каноне, но
// сорт/алиас не сматчен» (breweryId!=null) — последнее это rematch/alias-fix, не завод нового.
const matcher = buildMatcher(db);

// Тип-префиксы НЕ-пива: листинг с таким ведущим словом в канон крафта не идёт (#3).
const NONBEER = /^(сидр|cider|комбуча|kombucha|медовуха|мед\b|mead|зельцер|seltzer|hard seltzer|water kefir|кефир|тоник|tonic|лимонад|квас|вино|wine|cidre)/i;
// напитки-не-пиво по лексике в латинской части (кофе/лимонады/винонады/смузи-дринки)
const NONBEER_LEX = /\b(coffee\s+drink|milkis|vinonade|squeeze\b.*drink|lemonade|juice|soft\s+drink|energy\s+drink)\b/i;
// Импорт/мейнстрим бренды (не росс. крафт) — в канон не заводим, помечаем для отсечения (#3).
// Не исчерпывающий — топ-список верифицирует человек; здесь снимаем очевидный шум.
// проверяется по ПЕРВОМУ токену кандидата (не по склеенному ключу)
const IMPORT = new Set([
  "brewdog", "guinness", "weihenstephan", "weihenstephaner", "paulaner", "erdinger", "hoegaarden",
  "leffe", "duvel", "chimay", "corona", "budweiser", "heineken", "carlsberg", "kozel", "krusovice",
  "spaten", "franziskaner", "lindemans", "delirium", "kwak", "estrella", "schneider", "blanche",
  "rouge", "kriek", "boon", "straffe", "kasteel", "brugse", "maisel", "weltenburger", "omer",
  "moosehead", "godfather", "triporteur", "latrappe", "trappe", "val", "signal", "omertraditional",
  "weihenstephanervitus", "weihenstephaner1516", "brewdogpunk", "guinnessdraught", "maiselfriends",
  "bitburger", "krombacher", "augustiner", "ayinger", "schlenkerla", "liefmans", "timmermans",
  "lefebvre", "vedett", "gulden", "tongerlo", "grimbergen", "affligem", "westmalle", "rochefort",
]);
// Родовые слова — не бренд (срезаем из начала кандидата).
const GENERIC = new Set([
  "пиво", "beer", "пивной", "напиток", "крафт", "craft", "ремесленное", "светлое", "темное",
  "разливное", "бутылочное", "российское", "крафтовое", "живое", "пастеризованное",
  "нефильтрованное", "фильтрованное", "н", "ф",
  // чистые стили — не бренд: «IPA Ekuanot», «DIPA Simcoe» → ключ не должен быть стилем
  "ipa", "dipa", "tipa", "apa", "neipa", "ipl", "lager", "stout", "porter", "ale", "pils",
  "pilsner", "weizen", "weisse", "gose", "sour", "hop", "hazy", "blanche", "saison",
]);
const VOL_FMT = /\b(\d+[.,]?\d*\s*(л|ml|мл|l)|0[.,]\d+|кег|keg|банка|can|стекло|бутылка|bottle|pet|пэт|draft|разлив)\b/gi;
// общие первые слова, которые сами по себе не бренд → для них ключ берёт 2 токена (см. brandKey)
const GENERIC_FIRST = new Set([
  "red", "black", "white", "big", "double", "la", "le", "love", "new", "old", "golden", "dark",
  "light", "hard", "sour", "dry", "the", "blue", "green", "grey", "gray", "smoky", "wild", "first",
]);
// маркеры зарубежного пива в латинской части (бельг/нем/чех/итал лексика) — сильный признак
// импорта; надёжнее точечного словаря брендов. Росс. крафт латиницей — транслит/англ-нейминг.
const IMPORT_LEX = /\b(weisse|weiss|kloster|brouwerij|huisbrouwerij|brasserie|abbey|bourgogne|staatsbrauerei|brauerei|senza|alkoholfrei|bryggeri|cerveza|birra|nastro|tripel|dubbel|quadrupel|blond\s+special)\b/i;
const IMPORT_PREP = /\b(de|van|von|del|della)\s+[A-ZÀ-Þ]/; // "de Bourgogne", "van Honsebrouck" — регистрозависимо
const importHint = (latin: string) => IMPORT_LEX.test(latin) || IMPORT_PREP.test(latin);

type Row = { beer_name_raw: string | null; seller: string | null };
const rows = db.query("SELECT beer_name_raw, seller FROM price_listings WHERE beer_id IS NULL").all() as Row[];

/** Кандидат-бренд из сырого заголовка: латинская часть после "/", тип/объём срезаны, первые 1-2 токена. */
function brandKey(raw: string): { key: string; latin: string; nonbeer: boolean } | null {
  const nonbeer = NONBEER.test(raw.trim()) || NONBEER_LEX.test(raw);
  // латинская часть после последнего "/" (она чище: "Пиво Вася / Vasya Light 0.5" → "Vasya Light 0.5")
  const sl = raw.lastIndexOf("/");
  let s = (sl >= 0 ? raw.slice(sl + 1) : raw).replace(VOL_FMT, " ");
  // оставить латиницу (бренды РФ-крафта почти всегда дублируются латиницей)
  const latin = s.replace(/[^a-zA-Z0-9 &.\-]/g, " ").replace(/\s+/g, " ").trim();
  if (latin.length < 3) return null;
  const toks = latin.split(" ").filter((t) => t.length >= 2 && !GENERIC.has(t.toLowerCase()));
  if (!toks.length) return null;
  // ключ = ПЕРВЫЙ токен (бренд обычно первое слово → схлопывает многосортовые: Chibis *, Tarkos *).
  // НО если первое слово — общее прилагательное/артикль (Red/Black/White/Big…), оно само не бренд,
  // берём 2 токена, чтобы не слить разные бренды (Red Button ≠ Red Rocket, Black Cat ≠ Black Star).
  const first = toks[0]!;
  const second = toks[1] && toks[1].length >= 2 ? toks[1] : "";
  const useTwo = GENERIC_FIRST.has(first.toLowerCase()) && second;
  const key = normalizeName(useTwo ? `${first} ${second}` : first);
  if (key.length < 3) return null;
  return { key, latin, nonbeer };
}

type Agg = { listings: number; shops: Set<string>; examples: Set<string>; nonbeer: boolean; import: boolean };
const byBrand = new Map<string, Agg>();
let skipped = 0, canonMiss = 0;
for (const r of rows) {
  if (!r.beer_name_raw) { skipped++; continue; }
  // пивоварня всё же в каноне (matcher нашёл по алиасу, не сматчен лишь сорт) → не вне-канона,
  // это очередь rematch/alias-fix. В demand-кандидаты не берём.
  if (matcher.match(r.beer_name_raw).breweryId) { canonMiss++; continue; }
  const b = brandKey(r.beer_name_raw);
  if (!b) { skipped++; continue; }
  const firstTok = b.key.split(" ")[0]!;
  const isImport = IMPORT.has(firstTok) || IMPORT.has(b.key.replace(/ /g, "")) || importHint(b.latin);
  let a = byBrand.get(b.key);
  if (!a) { a = { listings: 0, shops: new Set(), examples: new Set(), nonbeer: b.nonbeer, import: isImport }; byBrand.set(b.key, a); }
  a.listings++;
  if (r.seller) a.shops.add(r.seller);
  if (a.examples.size < 3) a.examples.add(b.latin.slice(0, 60));
  a.nonbeer = a.nonbeer && b.nonbeer; // nonbeer только если ВСЕ листинги бренда — не-пиво
  a.import = a.import || isImport;     // import если ХОТЬ ОДИН листинг бренда — импорт-маркер
}

const all = [...byBrand.entries()].map(([key, a]) => ({ key, ...a, shops: a.shops.size, examples: [...a.examples] }))
  .sort((x, y) => (y.shops - x.shops) || (y.listings - x.listings));

const candidates = all.filter((b) => !b.nonbeer && !b.import && b.shops >= MIN_SHOPS);
const rejected = all.filter((b) => (b.nonbeer || b.import) && b.shops >= MIN_SHOPS);

console.log(`unmatched листингов: ${rows.length} | канон-промах (пивоварня есть, сорт нет → rematch): ${canonMiss} | пропущено (без бренда): ${skipped} | вне-канона бренд-ключей: ${all.length}`);
console.log(`\n=== КАНДИДАТЫ на канон (вне канона, ≥${MIN_SHOPS} магазинов, не импорт/не-пиво) — ${candidates.length} ===`);
console.log("shops  list  бренд-ключ            примеры");
for (const b of candidates.slice(0, 40)) {
  console.log(`  ${String(b.shops).padStart(2)}   ${String(b.listings).padStart(4)}  ${b.key.padEnd(20).slice(0, 20)}  ${b.examples.join(" | ").slice(0, 70)}`);
}
console.log(`\n=== ОТСЕЯНО как импорт/не-пиво (≥${MIN_SHOPS} магазинов) — ${rejected.length}, топ-15 ===`);
for (const b of rejected.slice(0, 15)) {
  console.log(`  ${String(b.shops).padStart(2)}   ${String(b.listings).padStart(4)}  ${b.key.padEnd(20).slice(0, 20)}  [${b.import ? "импорт" : "не-пиво"}] ${b.examples[0] ?? ""}`);
}
db.close();
