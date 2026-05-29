// Переиспользуемый сидер пивоварен из JSON-батча discovery (task-12).
// Батч = массив {name, city, aliases?, site?, telegram?, vk?, untappd?, confidence?}.
// Активность верифицируется при сборе батча (агенты), здесь — только upsert + дедуп по slug.
// Запуск: bun run scripts/seed-breweries.ts data/discovery/batch-2026-05-29.json
import { openDb, upsertBrewery, stats, type BreweryLink } from "@beer-log/store";

const file = process.argv[2] ?? "data/discovery/batch-2026-05-29.json";
const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";

type Rec = {
  name: string; city?: string; aliases?: string[];
  site?: string; telegram?: string; vk?: string; untappd?: string; confidence?: string;
};
const recs: Rec[] = JSON.parse(await Bun.file(file).text());

function links(r: Rec): BreweryLink[] {
  const out: BreweryLink[] = [];
  if (r.site) out.push({ kind: "website", url: r.site, title: "Сайт" });
  if (r.telegram) out.push({ kind: "telegram", url: r.telegram, title: "Telegram (офиц.)" });
  if (r.vk) out.push({ kind: "vk", url: r.vk, title: "VK" });
  if (r.untappd) out.push({ kind: "untappd", url: r.untappd, title: "Untappd" });
  return out;
}

const db = openDb(DB_PATH);
const before = stats(db).breweries;
let withTg = 0;
for (const r of recs) {
  upsertBrewery(db, {
    name: r.name, city: r.city, segment: "craft", country: "RU",
    aliases: r.aliases ?? [], links: links(r), canonicalName: true,
  });
  if (r.telegram) withTg++;
}
const after = stats(db);
console.log(`Батч: ${file}`);
console.log(`Записей в батче: ${recs.length} | с офиц. TG: ${withTg}`);
console.log(`Пивоварен в каталоге: ${before} → ${after.breweries} (+${after.breweries - before} новых)`);
db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
db.close();
