// Сид пивоварен из реестра russiancraftbeer.ru (breadth, переход depth→breadth).
// Источник: data/discovery/rcb-breweries.json (извлечено с /list — 209 пивоварен РФ-крафта).
// Заводит в канон ТОЛЬКО реально новых (которых нет среди текущих по устойчивой нормализации
// имени с транслитом — чтобы не плодить дубли для пивоварен, что у нас под англ. slug, а в
// реестре под рус. именем). Новым ставит segment=craft и registry-ссылку (провенанс). Дальше
// они входят в конвейер как «discovered» → brewery-research найдёт Untappd/TG → headless-pull.
//
//   bun run scripts/seed-rcb-breweries.ts          # сид (idempotent)
//   bun run scripts/seed-rcb-breweries.ts --dry    # только показать, сколько новых
import { openDb, upsertBrewery } from "@beer-log/store";

const SRC = "data/discovery/rcb-breweries.json";
const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const dry = process.argv.includes("--dry");

// Базовая кириллица→латиница для дедуп-сравнения (НЕ для отображения).
const TR: Record<string, string> = {
  а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",н:"n",
  о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"c",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",
  э:"e",ю:"yu",я:"ya",
};
// «сжатая» нормализация: транслит → только буквы/цифры, без пробелов/регистра/служебных слов.
function loose(s: string): string {
  let t = s.toLowerCase();
  t = t.replace(/[а-яё]/g, (c) => TR[c] ?? c);
  t = t.replace(/\b(brewery|brewing|brewpub|beer|craft|company|co|пивоварня|пивовар|brewery co)\b/g, "");
  return t.replace(/[^a-z0-9]/g, "");
}

const data = JSON.parse(await Bun.file(SRC).text()) as {
  breweries: { rcbSlug: string; name: string; url: string }[];
};

const db = openDb(DB_PATH);
const rows = db.query("SELECT name, aliases FROM breweries").all() as { name: string; aliases: string }[];
const known = new Set<string>();
for (const r of rows) {
  known.add(loose(r.name));
  for (const a of JSON.parse(r.aliases || "[]") as string[]) known.add(loose(a));
}

let inserted = 0;
const skipped: string[] = [];
const added: string[] = [];
for (const b of data.breweries) {
  const name = b.name.replace(/^["«»\s]+|["«»\s]+$/g, "").trim(); // снять обрамляющие кавычки
  if (!name || loose(name).length < 2) continue;
  if (known.has(loose(name))) { skipped.push(name); continue; }
  known.add(loose(name)); // защита от внутр. дублей реестра
  added.push(name);
  if (!dry) {
    upsertBrewery(db, {
      name,
      segment: "craft",
      links: [{ kind: "russiancraftbeer", url: b.url }],
    });
  }
  inserted++;
}

console.log(`Реестр: ${data.breweries.length} | уже известно: ${skipped.length} | ${dry ? "БУДЕТ заведено" : "заведено"}: ${inserted}`);
console.log(`\nновые:\n  ${added.join(", ")}`);
if (!dry) {
  const total = (db.query("SELECT COUNT(*) n FROM breweries").get() as { n: number }).n;
  console.log(`\nвсего пивоварен в каноне: ${total}`);
  db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
}
db.close();
