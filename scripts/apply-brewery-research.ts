// Применить результаты brewery-research (трек E, batch 2026-06-04): создать 10 RU-крафт пивоварен,
// вскрытых venue-меню Untappd, с верифицированными источниками (links) и алиасами (Cyrillic+Latin —
// чтобы матчер связал venue-листинги). Один писатель в SQLite, последовательно (как требует скилл).
//   bun run scripts/apply-brewery-research.ts
import { openDb, upsertBrewery } from "@beer-log/store";

const today = new Date().toISOString().slice(0, 10);
type L = { kind: string; url: string };
type Brew = { name: string; slug: string; city: string; aliases: string[]; links: L[] };

// Итог ресёрча (10 sonnet-субагентов, все подтверждены RU-крафт + живость). Только надёжные links:
// untappd (структурный источник сортов), верифицированный telegram, живой сайт, vk (информац.).
const RESULTS: Brew[] = [
  { name: "Осьминогец", slug: "osminogets", city: "Ростов-на-Дону",
    aliases: ["Osminogets", "Осьминогец / Osminogets"],
    links: [{ kind: "untappd", url: "https://untappd.com/w/osminogec-osminogets/557099" }, { kind: "telegram", url: "https://t.me/osminogets" }] },
  { name: "Midnight Project", slug: "midnight-project", city: "Санкт-Петербург",
    aliases: ["Полночный Проект"],
    links: [{ kind: "untappd", url: "https://untappd.com/w/midnight-project/329172" }] },
  { name: "Plague Brew", slug: "plague-brew", city: "Санкт-Петербург",
    aliases: ["Plague", "Плэйг Брю"],
    links: [{ kind: "untappd", url: "https://untappd.com/w/plague-brew/447721" }, { kind: "telegram", url: "https://t.me/plaguelive" }, { kind: "website", url: "https://plague-brew.ru" }, { kind: "vk", url: "https://vk.com/plaguebrew" }] },
  { name: "Godbeerg Brewery", slug: "godbeerg-brewery", city: "Шахты",
    aliases: ["Godbeerg", "Годберг"],
    links: [{ kind: "untappd", url: "https://untappd.com/w/godbeerg-brewery/495918" }, { kind: "telegram", url: "https://t.me/godbeerg" }, { kind: "website", url: "https://godbeerg.com" }] },
  { name: "КУЛИNAR", slug: "kulinar", city: "Москва",
    aliases: ["Kulinar", "Кулинар"],
    links: [{ kind: "untappd", url: "https://untappd.com/w/kulinar/513023" }] },
  { name: "ОСЛИНАЯ", slug: "oslinaya", city: "Санкт-Петербург",
    aliases: ["Oslinaya", "Ослиная"],
    links: [{ kind: "untappd", url: "https://untappd.com/w/oslinaya/493499" }, { kind: "telegram", url: "https://t.me/oslinayam" }, { kind: "website", url: "https://oslinaya.ru" }, { kind: "vk", url: "https://vk.com/oslinaya" }] },
  { name: "DorBeer", slug: "dorbeer", city: "Солнечногорск",
    aliases: ["Дорбир"],
    links: [{ kind: "untappd", url: "https://untappd.com/w/dorbeer/473011" }, { kind: "telegram", url: "https://t.me/dorbeer" }, { kind: "website", url: "https://dorbeer.ru" }] },
  { name: "Zero Point Non-alco Brewing Company", slug: "zero-point", city: "Москва",
    aliases: ["Zero Point", "Зеро Поинт", "Zero Point Non-alco"],
    links: [{ kind: "untappd", url: "https://untappd.com/w/zero-point-non-alco-brewing-company/492138" }, { kind: "website", url: "https://zerobrew.ru" }, { kind: "vk", url: "https://vk.com/zeropointbrew" }] },
  { name: "SALIWA", slug: "saliwa", city: "Санкт-Петербург",
    aliases: ["Saliwa", "Saliwa Brew"],
    links: [{ kind: "untappd", url: "https://untappd.com/w/saliwa-brew/454914" }, { kind: "telegram", url: "https://t.me/saliwa_spb" }, { kind: "vk", url: "https://vk.com/saliwa_spb" }] },
  { name: "OSTROVICA", slug: "ostrovica", city: "Аша",
    aliases: ["Островица"],
    links: [{ kind: "untappd", url: "https://untappd.com/w/ostrovica/231873" }, { kind: "telegram", url: "https://t.me/ostrovica" }, { kind: "website", url: "https://ostrovica.com" }] },
];

const db = openDb("data/catalog.sqlite");
let created = 0;
for (const b of RESULTS) {
  const links = b.links.map((l) => ({ ...l, seenAt: today }));
  const id = upsertBrewery(db, { name: b.name, slug: b.slug, city: b.city, country: "RU", segment: "craft", aliases: b.aliases, links });
  created++;
  console.log(`✓ ${b.name} [${b.slug}] ${b.city} · ${b.links.length} links · ${b.aliases.length} aliases → ${id}`);
}
db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
db.close();
console.log(`\nприменено пивоварен: ${created} (segment=craft, source=trek-E demand-discovery)`);
