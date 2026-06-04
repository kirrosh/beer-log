// CLI/прогон каскада «найти ту самую» по пулу точки (TASK-30 B1). Горячий путь — read.
//
//   bun scripts/search-venue.ts <seller> "<запрос>"     — одиночный поиск
//   bun scripts/search-venue.ts --demo [seller]          — прогон AC#3 + метрика
//
// Метрика AC#3: доля запросов с непустым полезным ответом (level ≠ none).
import { openDb } from "@beer-log/store";
import { buildVenueSearch, type SearchResult } from "./lib/venue-search.ts";

const DB = process.env.DB_PATH ?? "data/catalog.sqlite";
const DEFAULT_SELLER = "beermug-nn/gagarina-118";

const db = openDb(DB);
const args = process.argv.slice(2);

if (args[0] === "--demo") {
  runDemo(args[1] ?? DEFAULT_SELLER);
} else if (args.length >= 2) {
  const vs = buildVenueSearch(db, args[0]!);
  printResult(vs.search(args.slice(1).join(" ")));
} else {
  console.error('usage: search-venue.ts <seller> "<запрос>"  |  --demo [seller]');
  process.exit(1);
}

function runDemo(seller: string) {
  const vs = buildVenueSearch(db, seller);
  console.log(`Точка: ${seller} · пул сортов: ${vs.poolSize}\n`);

  // AC#3-кейсы: точный, опечатка, транслит-аббревиатура + контрольные «нет на точке»/мусор
  const cases = [
    "Jaws Атомная",          // частичный точный → fuzzy на «Атомная Прачечная»
    "Атомная Прачечная",     // полное имя сорта
    "атомнаая прачечнй",     // опечатки → fuzzy всё равно ловит (edit-distance)
    "бфг",                   // кириллица → транслит «Bfg» (Selfmade)
    "Selfmade BFG",          // бренд+аббревиатура
    "Коникс Хефевайцен",     // фонетич. транслит стиля → деградация в brewery (сорт Hefeweizen первым)
    "Plan B",                // только пивоварня → что есть у бренда (level=brewery)
    "Plan B Отличный план",  // бренд+сорт
    "AF Brew Хазер",         // в каталоге, но не в пуле точки → absent
    "asdqwe zzz",            // мусор → none
  ];

  let useful = 0;
  for (const q of cases) {
    const r = vs.search(q);
    if (r.level !== "none") useful++;
    printResult(r);
  }
  const pct = Math.round((useful / cases.length) * 100);
  console.log(`\nМетрика: непустой полезный ответ — ${useful}/${cases.length} (${pct}%)`);
}

function printResult(r: SearchResult) {
  const tag = { exact: "✓ ТОЧНО", fuzzy: "≈ ПОХОЖЕ", brewery: "⌂ БРЕНД", absent: "⊘ НЕ НА ТОЧКЕ", none: "✗ НЕТ" }[r.level];
  console.log(`«${r.query}» → ${tag}`);
  for (const c of r.candidates.slice(0, 4)) {
    const brand = c.breweryName ? `${c.breweryName} · ` : "";
    const fmt = c.format !== "—" ? ` [${c.format}]` : "";
    console.log(`    ${c.score.toFixed(2)}  ${brand}${c.beerName}${fmt}`);
  }
  if (!r.candidates.length) console.log("    —");
  console.log();
}
