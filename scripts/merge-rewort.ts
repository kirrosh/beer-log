// Слить ранее обогащённый Rewort (data/rewort-enriched.json) в основной каталог.
// Эталонная работа осела в отдельной БД и не доехала до catalog.sqlite — чиним
// фрагментацию: пивоварня + 7 сортов (validated, из TG-первоисточника) + цены.
// Запуск: bun run scripts/merge-rewort.ts
import { openDb, upsertBrewery, upsertBeer, recordListing, stats, type BreweryLink } from "@beer-log/store";
import { categorizeStyle } from "@beer-log/catalog-core";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const seenAt = "2026-05-29";

type Rec = {
  name: string; city: string; style: string; category: string;
  abv?: number; ibu?: number | null; description: string;
  links: string[]; prices: { shop: string; price: number }[];
  provenance: { post: string };
};
const recs: Rec[] = JSON.parse(await Bun.file("data/rewort-enriched.json").text());

// алиасы, которых нет в JSON (искажённый транслит — см. enrich-rewort/task-14)
const ALIASES: Record<string, string[]> = { "Крылья отваги": ["Kryly Advagi"] };

const rewortLinks: BreweryLink[] = [
  { kind: "website", url: "https://rewort.ru", title: "Сайт" },
  { kind: "telegram", url: "https://t.me/RewortBrewery", title: "Telegram (офиц.)" },
  { kind: "vk", url: "https://vk.com/rewort", title: "VK" },
  { kind: "untappd", url: "https://untappd.com/rewort", title: "Untappd" },
];

const db = openDb(DB_PATH);
const brewId = upsertBrewery(db, {
  name: "Rewort Brewery", city: "Сергиев Посад", segment: "craft", country: "RU",
  aliases: ["Rewort", "ReWort", "Реворт"], links: rewortLinks, canonicalName: true,
});

let beersN = 0, pricesN = 0;
for (const r of recs) {
  const st = categorizeStyle(r.style);
  const category = st.category !== "unknown" ? st.category : (r.category as typeof st.category);
  const beerId = upsertBeer(db, {
    name: r.name, breweryId: brewId, breweryNameRaw: "Rewort Brewery",
    abv: r.abv, ibu: r.ibu ?? undefined, status: "validated",
    style: { slug: st.slug, name: r.style, category },
    aliases: ALIASES[r.name] ?? [],
    source: { url: r.provenance.post, excerpt: r.description, seenAt },
  });
  beersN++;
  for (const p of r.prices ?? []) {
    recordListing(db, {
      beerId, beerNameRaw: r.name, price: p.price, currency: "RUB", volumeMl: 500,
      format: "can", seller: p.shop, sourceUrl: `https://${p.shop}`, seenAt,
    });
    pricesN++;
  }
}

console.log(`Rewort слит: +1 пивоварня, +${beersN} сортов, +${pricesN} цен`);
console.log("STATS:", JSON.stringify(stats(db)));
db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
db.close();
