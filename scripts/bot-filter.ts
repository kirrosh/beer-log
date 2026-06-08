#!/usr/bin/env bun
// TASK-32 (B2): «запрос словами → структурный фильтр» по пулу точки.
// Бот (агент) парсит фразу сам и передаёт структурные флаги; --q включает встроенный
// лексикон-фолбэк (он же используется в --demo для AC#3). Горячий путь — readonly.
//
//   bun scripts/bot-filter.ts --seller <s> --q "кислое до 500"
//   bun scripts/bot-filter.ts --seller <s> --style sour-wild --price-max 500 --format can,bottle --json
//   bun scripts/bot-filter.ts --demo [seller]
import { openDb } from "@beer-log/store";
import { parseQuery, runFilter, type QueryFilter } from "./lib/query-filter.ts";

const DB = process.env.DB_PATH ?? "data/catalog.sqlite";
const DEFAULT_SELLER = "beermug-nn/gagarina-118";

const argv = process.argv.slice(2);

function flag(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

if (argv[0] === "--demo") {
  runDemo(argv[1] ?? DEFAULT_SELLER);
  process.exit(0);
}

const seller = flag("seller");
if (!seller) {
  console.error('usage: bot-filter.ts --seller <s> [--q "<фраза>"] [--style <cat>] [--abv-min N] [--abv-max N] [--price-max N] [--format can,bottle] [--limit N] [--json]');
  console.error("       bot-filter.ts --demo [seller]");
  process.exit(1);
}

const db = openDb(DB);

// фильтр: явные флаги имеют приоритет; --q заполняет ТОЛЬКО незаданные поля (фолбэк-парс)
const filter: QueryFilter = buildFilter();
const limit = Number(flag("limit") ?? 12);
const run = runFilter(db, seller, filter, limit);

if (argv.includes("--json")) {
  console.log(JSON.stringify({ seller, query: flag("q") ?? null, ...run }, null, 2));
} else {
  printHuman(seller, flag("q") ?? null, run);
}

function buildFilter(): QueryFilter {
  const q = flag("q");
  const f: QueryFilter = q ? parseQuery(q) : {};
  // явные флаги перекрывают/дополняют разбор
  const style = flag("style"); if (style) f.style = style;
  const abvMin = flag("abv-min"); if (abvMin != null) f.abvMin = Number(abvMin);
  const abvMax = flag("abv-max"); if (abvMax != null) f.abvMax = Number(abvMax);
  const priceMax = flag("price-max"); if (priceMax != null) f.priceMax = Number(priceMax);
  const fmt = flag("format"); if (fmt) f.format = fmt.split(",").map((s) => s.trim()).filter(Boolean);
  return f;
}

function describeFilter(f: QueryFilter): string {
  const p: string[] = [];
  if (f.style) p.push(`стиль ${f.style}`);
  if (f.abvMin != null) p.push(`ABV ≥ ${f.abvMin}%`);
  if (f.abvMax != null) p.push(`ABV ≤ ${f.abvMax}%`);
  if (f.priceMax != null) p.push(`до ${f.priceMax}₽`);
  if (f.format?.length) p.push(`формат ${f.format.join("/")}`);
  return p.length ? p.join(", ") : "без условий";
}

function printHuman(seller: string, q: string | null, run: ReturnType<typeof runFilter>) {
  const head = q ? `«${q}» → ${describeFilter(run.filter)}` : describeFilter(run.filter);
  console.log(`${head}  ·  точка ${seller}`);
  if (run.relaxed.length) {
    console.log(`  ⚠ точного совпадения нет — ослаблено: ${run.relaxed.join(", ")}`);
  }
  if (!run.count) { console.log("  — ничего не нашлось даже без условий"); return; }
  for (const it of run.items) {
    const brand = it.brewery ? `${it.brewery} · ` : "";
    const abv = it.abv != null ? ` ${it.abv}%` : "";
    const price = it.price != null ? ` · ${it.price}₽` : "";
    const fmt = it.format !== "unknown" ? ` [${it.format}]` : "";
    const st = it.styleName ? ` — ${it.styleName}` : "";
    console.log(`  • ${brand}${it.beer}${abv}${st}${price}${fmt}`);
  }
}

// AC#3: прогон фиксированных кейсов с метрикой «доля непустых полезных ответов»
function runDemo(seller: string) {
  const ddb = openDb(DB);
  const cases = [
    "кислое до 500",
    "крепкий стаут",
    "лёгкое на вынос",
    "что покрепче но не очень",     // compound из описания задачи
    "лёгкое пшеничное на вынос",
  ];
  console.log(`Точка: ${seller}\n`);
  let useful = 0;
  for (const q of cases) {
    const f = parseQuery(q);
    const run = runFilter(ddb, seller, f, 5);
    if (run.count) useful++;
    console.log(`«${q}»`);
    console.log(`    парс: ${describeFilter(f)}`);
    if (run.relaxed.length) console.log(`    ослаблено: ${run.relaxed.join(", ")}`);
    console.log(`    найдено: ${run.count}`);
    for (const it of run.items.slice(0, 3)) {
      const brand = it.brewery ? `${it.brewery} · ` : "";
      const abv = it.abv != null ? ` ${it.abv}%` : "";
      const price = it.price != null ? ` · ${it.price}₽` : "";
      console.log(`      ${brand}${it.beer}${abv}${price} [${it.format}]`);
    }
    console.log();
  }
  const pct = Math.round((useful / cases.length) * 100);
  console.log(`Метрика: непустой ответ — ${useful}/${cases.length} (${pct}%)`);
}
