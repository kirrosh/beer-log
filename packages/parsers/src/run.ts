// CLI: bun run packages/parsers/src/run.ts [@channel]
import { telegramWebParser } from "./telegram/telegram-web.ts";
import { SEED_TELEGRAM_SOURCES } from "./sources.ts";

const arg = process.argv[2];
const targets = arg ? [arg] : SEED_TELEGRAM_SOURCES.map((s) => s.handle);

for (const t of targets) {
  console.log(`\n=== ${t} ===`);
  try {
    const r = await telegramWebParser.parse(t);
    console.log(`fetched: ${r.fetchedAt}`);
    console.log(`beers: ${r.beers.length} | listings: ${r.listings.length} | unparsed: ${r.unparsed.length}`);
    for (const b of r.beers.slice(0, 12)) {
      const style = b.style ? ` [${b.style.name}]` : "";
      const abv = b.abv ? ` ${b.abv}%` : "";
      console.log(`  • ${b.name}${style}${abv}`);
    }
    for (const l of r.listings.slice(0, 12)) {
      console.log(`  ₽ ${l.beerNameRaw} — ${l.price} ${l.currency}${l.volumeMl ? ` / ${l.volumeMl}мл` : ""} (${l.format})`);
    }
  } catch (e) {
    console.error(`  parse failed: ${e}`);
  }
}
