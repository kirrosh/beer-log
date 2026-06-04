// CLI личных срезов точки (TASK-33 B4): «не пробовал» / «от любимых» / «топ точки» / «замена».
//
//   bun scripts/venue-personal.ts --demo [seller]
//   bun scripts/venue-personal.ts <seller> sub <beerId>   — каскад замены для сорта
import { openDb } from "@beer-log/store";
import { buildVenuePersonal } from "./lib/venue-personal.ts";
import type { PoolItem } from "./lib/venue-search.ts";

const DB = process.env.DB_PATH ?? "data/catalog.sqlite";
const DEFAULT_SELLER = "beermug-nn/gagarina-118";
const db = openDb(DB);
const args = process.argv.slice(2);

if (args[0] === "--demo") {
  runDemo(args[1] ?? DEFAULT_SELLER);
} else if (args.length >= 3 && args[1] === "sub") {
  const vp = buildVenuePersonal(db, args[0]!);
  const s = vp.substitution(args[2]!);
  console.log(`Замена (основание: ${s.level}):`);
  s.candidates.slice(0, 8).forEach((p) => console.log(`  ${line(p)}`));
} else {
  console.error('usage: venue-personal.ts --demo [seller] | <seller> sub <beerId>');
  process.exit(1);
}

function runDemo(seller: string) {
  const vp = buildVenuePersonal(db, seller);
  console.log(`Точка: ${seller} · пул ${vp.poolSize} · пробовал тут ${vp.stats.tastedHere} · любимых пивоварен ${vp.stats.favoriteBreweries}\n`);

  const nt = vp.notTasted();
  console.log(`▸ НЕ пробовал тут (${nt.length}/${vp.poolSize}):`);
  nt.slice(0, 8).forEach((p) => console.log(`    ${line(p)}`));
  if (nt.length > 8) console.log(`    … ещё ${nt.length - 8}`);

  const fav = vp.fromFavorites();
  console.log(`\n▸ От твоих любимых пивоварен (${fav.length}):`);
  if (fav.length) fav.slice(0, 8).forEach((p) => console.log(`    ${line(p)}`));
  else console.log(`    — (пусто: в tastings нет favorite/fire — наполни личный слой)`);

  const hl = vp.highlights();
  console.log(`\n▸ Топ точки (highlights, ${hl.length}):`);
  hl.forEach((h) => console.log(`    [${h.badge}]${h.inPool ? "" : " (сейчас НЕ в пуле)"} ${h.beer} — ${h.reason}`));

  // замена: для первого highlight'а (как пример «не нашёл ту самую»)
  const probe = hl[0];
  if (probe?.beerId) {
    const s = vp.substitution(probe.beerId);
    console.log(`\n▸ Замена для «${probe.beer}» (основание: ${s.level}):`);
    s.candidates.slice(0, 5).forEach((p) => console.log(`    ${line(p)}`));
    if (!s.candidates.length) console.log(`    —`);
  }
}

function line(p: PoolItem): string {
  const brand = p.breweryName ? `${p.breweryName} · ` : "";
  const style = p.styleCategory ? ` (${p.styleCategory})` : "";
  const price = p.price != null ? ` ${p.price}₽` : "";
  return `${brand}${p.beerName}${style} [${p.format}]${price}`;
}
