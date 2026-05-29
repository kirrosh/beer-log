// Собрать каталог: сид пивоварен из russiancraftbeer + ингест TG-каналов.
// Запуск: bun run scripts/build-catalog.ts   (env DB_PATH опц.)
import { openDb, ingestParseResult, upsertBrewery, stats } from "@beer-log/store";
import { telegramWebParser, SEED_TELEGRAM_SOURCES, parseRcbExport } from "@beer-log/parsers";

const db = openDb(process.env.DB_PATH ?? "beer-log.sqlite");

// 1) сид пивоварен РФ из реестра russiancraftbeer.ru
const res = await fetch("http://russiancraftbeer.ru/export", {
  headers: { "User-Agent": "beer-log/0.1 (catalog seed)" },
});
const rcb = parseRcbExport(await res.text());
for (const name of rcb.breweries) upsertBrewery(db, { name, segment: "craft" });
console.log(`rcb seed: breweries=${rcb.breweries.length}, venues=${rcb.venues.length}`);

// 2) ингест TG-каналов
for (const s of SEED_TELEGRAM_SOURCES) {
  try {
    const r = await telegramWebParser.parse(s.handle);
    const { beers, listings } = ingestParseResult(db, r);
    console.log(`${s.handle}: +${beers} beers, +${listings} listings`);
  } catch (e) {
    console.error(`${s.handle}: ${e}`);
  }
}
console.log(stats(db));
