/**
 * canon-draft.ts — детерминированный черновик визиток пивоварен по дистрибуции (TASK-52 #2/#3).
 *
 * Для каждой пивоварни топ-сорт по числу продавцов (breadth) = черновая запись brewery-flagship с
 * basis=distribution. Гипотеза: что закупщики держат шире всего у этой пивоварни — её визитка.
 * Это ЧЕРНОВИК: research/checkins (TASK-53/59/60) его уточняют и приоритетнее (см. дедуп ниже).
 *
 * Вход:  bun run scripts/canon-draft.ts [--dry]
 * Выход: обновлённый data/personal/canon.json + сводка (создано / обновлено / пропущено locked).
 *
 * Дедуп (AC#3): один distribution-флагман на пивоварню. Если у пивоварни уже есть brewery-flagship
 * с basis ≠ distribution (research/checkins/ручной) — НЕ трогаем (курация приоритетна). Существующий
 * distribution-черновик обновляем (топ-сорт мог смениться), addedAt сохраняем. Повторный прогон без
 * изменения данных даёт идентичный файл (идемпотентность).
 */
import { Database } from "bun:sqlite";
import { loadCanon, saveCanon, type CanonEntry } from "./lib/canon.ts";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const dry = process.argv.includes("--dry");

// Порог: топ-сорт пивоварни держат ≥3 продавца — рыночный сигнал визитки, а не разовый листинг.
// Подобран по факт. распределению (TASK-52): ~54 пивоварни из 86 с листингами проходят порог.
const FLAGSHIP_MIN_BREADTH = 3;

const today = new Date().toISOString().slice(0, 10);

const db = new Database(DB_PATH, { readonly: true });

type Row = {
  id: string; bid: string; name: string; status: string; brewName: string | null;
  breadth: number; listings: number;
};
const rows = db.query(
  `SELECT b.id AS id, b.brewery_id AS bid, b.name AS name, b.status AS status,
          br.name AS brewName,
          COUNT(DISTINCT pl.seller) AS breadth, COUNT(*) AS listings
     FROM beers b
     JOIN price_listings pl ON pl.beer_id = b.id
     LEFT JOIN breweries br ON br.id = b.brewery_id
    WHERE b.brewery_id IS NOT NULL
    GROUP BY b.id`,
).all() as Row[];
db.close();

// beerId → breweryId: чтобы по существующим canon-записям понять, у какой пивоварни уже есть флагман
const breweryOfBeer = new Map<string, string>();
for (const r of rows) breweryOfBeer.set(r.id, r.bid);

// топ-сорт каждой пивоварни: breadth ↓, затем validated, затем число листингов ↓, затем имя
const byBrewery = new Map<string, Row[]>();
for (const r of rows) (byBrewery.get(r.bid) ?? byBrewery.set(r.bid, []).get(r.bid)!).push(r);

function pickTop(beers: Row[]): Row {
  return [...beers].sort((a, b) =>
    b.breadth - a.breadth ||
    Number(b.status === "validated") - Number(a.status === "validated") ||
    b.listings - a.listings ||
    a.name.localeCompare(b.name, "ru"),
  )[0]!;
}

const file = loadCanon();
// существующие brewery-flagship по пивоварне (через beerId → breweryId)
const flagshipByBrewery = new Map<string, CanonEntry>();
for (const e of file.canon) {
  if (e.canonType !== "brewery-flagship" || !e.beerId) continue;
  const bid = breweryOfBeer.get(e.beerId);
  if (bid) flagshipByBrewery.set(bid, e);
}

let created = 0, refreshed = 0, lockedSkipped = 0, belowThreshold = 0;

for (const [bid, beers] of byBrewery) {
  const top = pickTop(beers);
  if (top.breadth < FLAGSHIP_MIN_BREADTH) { belowThreshold++; continue; }

  const beerName = top.brewName ? `${top.brewName} ${top.name}` : top.name;
  // «по N точкам» — дательный мн. ч., грамматически корректен для всех N ≥ порога (3+)
  const basisNote = `самый широко распределённый сорт пивоварни (по ${top.breadth} точкам)`;
  const existing = flagshipByBrewery.get(bid);

  if (existing) {
    if (existing.basis !== "distribution") { lockedSkipped++; continue; } // курацию не перетираем
    // обновляем distribution-черновик (топ мог смениться), addedAt сохраняем
    existing.beerId = top.id;
    existing.beer = beerName;
    existing.basisNote = basisNote;
    refreshed++;
  } else {
    file.canon.push({
      beerId: top.id, beer: beerName, canonType: "brewery-flagship",
      basis: "distribution", basisNote, addedAt: today,
    });
    created++;
  }
}

const summary = { created, refreshed, lockedSkipped, belowThreshold, total: file.canon.length, dry };
if (!dry) saveCanon(file);
console.log(JSON.stringify(summary));
