// Применить результаты brewery-research (трек E): создать RU-крафт пивоварни, вскрытые venue-меню
// Untappd, с верифицированными источниками (links) и алиасами (Cyrillic+Latin — чтобы матчер связал
// venue-листинги). Один писатель в SQLite, последовательно. WAVE задаётся аргументом (1|2).
//   bun run scripts/apply-brewery-research.ts 2
import { openDb, upsertBrewery } from "@beer-log/store";

const today = new Date().toISOString().slice(0, 10);
const wave = process.argv[2] ?? "2";
type L = { kind: string; url: string };
type Brew = { name: string; slug: string; city: string | null; aliases: string[]; links: L[] };

// Волна 1 (2026-06-04): первые 10 (уже применены, оставлены для воспроизводимости).
const WAVE1: Brew[] = [
  { name: "Осьминогец", slug: "osminogets", city: "Ростов-на-Дону", aliases: ["Osminogets", "Осьминогец / Osminogets"], links: [{ kind: "untappd", url: "https://untappd.com/w/osminogec-osminogets/557099" }, { kind: "telegram", url: "https://t.me/osminogets" }] },
  { name: "Midnight Project", slug: "midnight-project", city: "Санкт-Петербург", aliases: ["Полночный Проект"], links: [{ kind: "untappd", url: "https://untappd.com/w/midnight-project/329172" }] },
  { name: "Plague Brew", slug: "plague-brew", city: "Санкт-Петербург", aliases: ["Plague", "Плэйг Брю"], links: [{ kind: "untappd", url: "https://untappd.com/w/plague-brew/447721" }, { kind: "telegram", url: "https://t.me/plaguelive" }, { kind: "website", url: "https://plague-brew.ru" }, { kind: "vk", url: "https://vk.com/plaguebrew" }] },
  { name: "Godbeerg Brewery", slug: "godbeerg-brewery", city: "Шахты", aliases: ["Godbeerg", "Годберг"], links: [{ kind: "untappd", url: "https://untappd.com/w/godbeerg-brewery/495918" }, { kind: "telegram", url: "https://t.me/godbeerg" }, { kind: "website", url: "https://godbeerg.com" }] },
  { name: "КУЛИNAR", slug: "kulinar", city: "Москва", aliases: ["Kulinar", "Кулинар"], links: [{ kind: "untappd", url: "https://untappd.com/w/kulinar/513023" }] },
  { name: "ОСЛИНАЯ", slug: "oslinaya", city: "Санкт-Петербург", aliases: ["Oslinaya", "Ослиная"], links: [{ kind: "untappd", url: "https://untappd.com/w/oslinaya/493499" }, { kind: "telegram", url: "https://t.me/oslinayam" }, { kind: "website", url: "https://oslinaya.ru" }, { kind: "vk", url: "https://vk.com/oslinaya" }] },
  { name: "DorBeer", slug: "dorbeer", city: "Солнечногорск", aliases: ["Дорбир"], links: [{ kind: "untappd", url: "https://untappd.com/w/dorbeer/473011" }, { kind: "telegram", url: "https://t.me/dorbeer" }, { kind: "website", url: "https://dorbeer.ru" }] },
  { name: "Zero Point Non-alco Brewing Company", slug: "zero-point", city: "Москва", aliases: ["Zero Point", "Зеро Поинт", "Zero Point Non-alco"], links: [{ kind: "untappd", url: "https://untappd.com/w/zero-point-non-alco-brewing-company/492138" }, { kind: "website", url: "https://zerobrew.ru" }, { kind: "vk", url: "https://vk.com/zeropointbrew" }] },
  { name: "SALIWA", slug: "saliwa", city: "Санкт-Петербург", aliases: ["Saliwa", "Saliwa Brew"], links: [{ kind: "untappd", url: "https://untappd.com/w/saliwa-brew/454914" }, { kind: "telegram", url: "https://t.me/saliwa_spb" }, { kind: "vk", url: "https://vk.com/saliwa_spb" }] },
  { name: "OSTROVICA", slug: "ostrovica", city: "Аша", aliases: ["Островица"], links: [{ kind: "untappd", url: "https://untappd.com/w/ostrovica/231873" }, { kind: "telegram", url: "https://t.me/ostrovica" }, { kind: "website", url: "https://ostrovica.com" }] },
];

// Волна 2 (2026-06-04): следующие 9 из хвоста discovery (все подтверждены RU-крафт + живость).
const WAVE2: Brew[] = [
  { name: "Щеглец", slug: "sheglec", city: "Великий Новгород", aliases: ["Sheglec", "Щеглецъ"], links: [{ kind: "untappd", url: "https://untappd.com/w/sheglec/552111" }] },
  { name: "МАРОВАР", slug: "marovar", city: "Санкт-Петербург", aliases: ["Marovar"], links: [{ kind: "untappd", url: "https://untappd.com/w/marovar/590562" }] },
  { name: "ПЗ Канцлеръ", slug: "pz-kancler", city: "Воронеж", aliases: ["Канцлеръ", "Канцлер", "Kanzler", "Kancler"], links: [{ kind: "untappd", url: "https://untappd.com/w/pz-kancler/136488" }, { kind: "website", url: "https://npk-kanzler.ru" }, { kind: "vk", url: "https://vk.com/kanzlerbeer" }] },
  { name: "Пять углов", slug: "pyat-uglov", city: "Санкт-Петербург", aliases: ["Pyat Uglov", "5 углов"], links: [{ kind: "untappd", url: "https://untappd.com/w/pyat-uglov/559587" }, { kind: "website", url: "https://5uglov.team" }] },
  { name: "Якорь. Крымская пивоварня", slug: "yakor-krymskaya", city: "Суворовское (Крым)", aliases: ["Якорь", "Yakor", "Крымская пивоварня"], links: [{ kind: "untappd", url: "https://untappd.com/w/yakor-krymskaya-pivovarnya/396909" }, { kind: "website", url: "https://yakorbeer.ru" }] },
  { name: "TBP", slug: "tbp", city: "Санкт-Петербург", aliases: ["Теория Большого Пива", "ТБП", "TBP Brewery"], links: [{ kind: "untappd", url: "https://untappd.com/w/tbp/484008" }, { kind: "vk", url: "https://vk.com/tbpps" }] },
  { name: "Boxing Wizard Brewery", slug: "boxing-wizard-brewery", city: "Москва", aliases: ["Boxing Wizard"], links: [{ kind: "untappd", url: "https://untappd.com/w/boxing-wizard-brewery/520290" }] },
  { name: "Two Peaks Brew Lab", slug: "two-peaks-brew-lab", city: "Санкт-Петербург", aliases: ["Two Peaks"], links: [{ kind: "untappd", url: "https://untappd.com/w/two-peaks-brew-lab/520596" }] },
  { name: "Amplifier", slug: "amplifier", city: null, aliases: ["Amplifier Beer"], links: [{ kind: "untappd", url: "https://untappd.com/w/amplifier/587358" }] },
];

const batch = wave === "1" ? WAVE1 : WAVE2;
const db = openDb("data/catalog.sqlite");
let n = 0;
for (const b of batch) {
  const links = b.links.map((l) => ({ ...l, seenAt: today }));
  const id = upsertBrewery(db, { name: b.name, slug: b.slug, city: b.city ?? undefined, country: "RU", segment: "craft", aliases: b.aliases, links });
  n++;
  console.log(`✓ ${b.name} [${b.slug}] ${b.city ?? "—"} · ${b.links.length} links · ${b.aliases.length} aliases → ${id}`);
}
db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
db.close();
console.log(`\nприменено пивоварен (волна ${wave}): ${n} (segment=craft, source=trek-E demand-discovery)`);
