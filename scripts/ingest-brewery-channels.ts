// Ингест сортов из офиц. TG-каналов пивоварен (task-13).
// У каждой пивоварни свой формат релиза → regex (parseBreweryReleases, формат Rewort)
// не генерализуется. Поэтому характеристики извлечены агентами craft-enrich из публичного
// превью t.me/s/<handle> (2026-05-29): только то, что реально в посте — ABV/IBU/Plato
// проставлены лишь где явно указаны, иначе null. Стиль нормализуется categorizeStyle.
// Запуск: bun run scripts/ingest-brewery-channels.ts   (пишет в data/catalog.sqlite)
import { openDb, upsertBeer, stats } from "@beer-log/store";
import { categorizeStyle } from "@beer-log/catalog-core";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const seenAt = "2026-05-29";

type Rel = {
  name: string; styleRaw: string; category: string;
  abv?: number | null; plato?: number | null; ibu?: number | null;
  description: string; tags: string[];
};
// брендовый канал → { brewerySlug, handle, releases }
type Channel = { brewerySlug: string; handle: string; releases: Rel[] };

const CHANNELS: Channel[] = [
  { brewerySlug: "afbrew", handle: "afbrewandco", releases: [
    { name: "Mosaic (безалкогольный)", styleRaw: "American IPA", category: "ipa",
      tags: ["American IPA", "non-alcoholic", "Mosaic", "тропики", "дыня", "горечь"],
      description: "Безалкогольная версия раннего сорта Mosaic American IPA (с 2013). Чистый и сухой, с уверенной горечью и профилем хмеля Mosaic: тропики, дыня, чёрная смородина." },
    { name: "Сочность", styleRaw: "NEIPA", category: "ipa",
      tags: ["NEIPA", "Nelson Sauvin", "гуава", "юдзу", "тиоловые дрожжи", "тропики"],
      description: "NEIPA: хмель Nelson Sauvin даёт виноградно-тропическую глубину, гуава — фруктовую плотность, юдзу — цитрусовый всплеск; тиоловые дрожжи раскручивают аромат." },
  ]},
  { brewerySlug: "brewlok", handle: "brewlokbrewery", releases: [
    { name: "Рахманинов", styleRaw: "Barleywine & Wild Ale", category: "sour-wild", abv: 13.5,
      tags: ["barleywine", "wild-ale", "купаж", "клубника", "бочковая выдержка", "бренди-бочка"],
      description: "Купаж барливайна и вайлд эля с клубникой, первый в линейке про русских композиторов. Барливайн выдержан в бренди-бочке с 2021; вайлд эль дал кислотность и ягодную глубину." },
  ]},
  { brewerySlug: "selfmade-brewery", handle: "selfmadebrew", releases: [
    { name: "Hellraiser", styleRaw: "West Coast IPA", category: "ipa", abv: 6.5,
      tags: ["West Coast IPA", "collab", "Idaho 7", "Mosaic Cryo", "цитрус", "тропики"],
      description: "West Coast IPA, коллаб с баром Neighborhood. Хмели Idaho 7 и Mosaic Cryo: ягоды, цитрусовые, тропические фрукты." },
    { name: "Tomato Method Adjika", styleRaw: "Hot Tomato Gose", category: "sour-wild", abv: 5.8,
      tags: ["Gose", "томат", "острое", "аджика", "collab", "sour"],
      description: "Острый томатный гозе, коллаб с Seven Roads (Тбилиси): томаты и грузинская аджика." },
    { name: "Fragment", styleRaw: "Non Alco IPA", category: "ipa", abv: 0.5,
      tags: ["IPA", "non-alco", "Warrior", "Cascade", "Citra", "хвойный"],
      description: "Безалкогольный IPA на хмелях Warrior, Cascade, Citra. Лёгкий, с хвойным вкусом и цитрусовым шлейфом." },
    { name: "Sunscity Groove", styleRaw: "American Pale Ale", category: "pale-ale", abv: 5.0,
      tags: ["APA", "Centennial", "Mosaic", "цветочный", "цитрусовый", "летнее"],
      description: "American Pale Ale на Centennial и Mosaic. Лёгкий летний эль с цветочно-цитрусовым профилем." },
    { name: "The Forge: HBC 682", styleRaw: "Single Hop DIPA", category: "ipa", abv: 8.5,
      tags: ["DIPA", "single hop", "HBC 682", "крепкий", "солодовый"],
      description: "Одно-хмелевой Double IPA на HBC 682. Крепкий солодовый сорт в кузнечно-скандинавской теме." },
    { name: "Lunar Voice", styleRaw: "Hazy IPA", category: "ipa", abv: 6.0,
      tags: ["Hazy IPA", "Strata", "Riwaka", "цитрус", "маракуйя", "гуава"],
      description: "Hazy IPA на Strata и Riwaka Amplifire. Цитрусовый профиль с нотами маракуйи и гуавы." },
    { name: "Abyssal Brute", styleRaw: "Melomel", category: "specialty", abv: 13.5,
      tags: ["Melomel", "mead", "вишня", "гранат", "мёд", "десертное"],
      description: "Меломель (медовуха) с вишней и гранатом: спелая вишня и бархатистый мёд с гранатовыми штрихами." },
  ]},
  { brewerySlug: "salden-s", handle: "saldensbrewery", releases: [
    { name: "India Pale Lager Cashmere", styleRaw: "India Pale Lager", category: "lager", abv: 7,
      tags: ["India Pale Lager", "лагер", "Cashmere", "охмелённый", "полнотелое"],
      description: "Гибрид IPL: лагерная чистота, интенсивно охмелён Cashmere. Округлая горечь на солодовой базе, полнотелое, терпкое послевкусие." },
    { name: "Dortmund Lager", styleRaw: "Dortmunder Export", category: "lager", abv: 5.5,
      tags: ["Dortmunder Export", "лагер", "солодовая база", "сухой финиш", "сбалансированный"],
      description: "Дортмундский экспортный лагер: чистый, сбалансированный, мягкая горчинка, солодовая база, сухой финиш. В линейке более 10 лет." },
    { name: "Wild Wheat Ale", styleRaw: "Wild Ale", category: "sour-wild",
      tags: ["wild ale", "спонтанная ферментация", "бретт", "дубовая выдержка", "пшеничный"],
      description: "Дикий пшеничный эль 'жёлтой' серии: спонтанная ферментация в дубовых кулшипах с бреттом. Аккуратная кислотность, фруктовость, округлость." },
    { name: "Wild Rye Ale", styleRaw: "Wild Ale", category: "sour-wild",
      tags: ["wild ale", "ржаной", "спонтанная ферментация", "бретт", "сухость"],
      description: "Дикий ржаной эль 'жёлтой' серии: ржаные корки, сухость, баланс в горечь, терпкость. Спонтанная ферментация в дубе." },
    { name: "Cherry Cola Ale", styleRaw: "Fruit Ale", category: "specialty", abv: 5,
      tags: ["fruit ale", "вишня", "лёгкий", "мягкая кислинка", "пряность", "лимитка"],
      description: "Ограниченная партия: ароматный лёгкий эль с мягкой кислинкой и пряностью, плотный красно-вишнёвый цвет." },
    { name: "Tears of Liberty", styleRaw: "American Pale Ale", category: "pale-ale", abv: 5.5,
      tags: ["APA", "цитрус", "травянистые ноты", "мягкая горчинка", "ароматный"],
      description: "Авторский APA, вход в крафт: ароматный, цитрус и травы, мягкая горчинка, солодовая база без лишней сладости." },
    { name: "Violent Twins", styleRaw: "IPA", category: "ipa", abv: 8.5,
      tags: ["IPA", "Citra", "Mosaic", "Centennial", "Amarillo", "тропики", "хвоя"],
      description: "Культовый IPA на пяти хмелях (Citra, Mosaic, Warrior, Centennial, Amarillo): мощная горечь, плотное тело, хвоя и тропические фрукты, сухой финиш." },
  ]},
  { brewerySlug: "zagovor-brewery", handle: "zagovorbrewery", releases: [
    { name: "Dozen West Coast IPA", styleRaw: "West Coast IPA", category: "ipa", abv: 6.5, ibu: 55,
      tags: ["West Coast IPA", "сухой", "ароматный", "горький", "бленд хмелей"],
      description: "Ароматный, сухой, деликатно горький WC IPA на бленде лучших хмелей 2026. Юбилейная серия Dozen (12 лет)." },
    { name: "Dozen Sour", styleRaw: "Sour Ale", category: "sour-wild", abv: 6,
      tags: ["sour", "фруктовый", "ананас", "ежевика", "гуава", "лактоза", "десерт"],
      description: "Фруктово-ягодный десертный Sour Ale: ананас, ежевика, гуава, каламанси, базилик, мягкая лактозная текстура. Серия Dozen." },
    { name: "Dozen New England Quad IPA", styleRaw: "New England Quad IPA", category: "ipa", abv: 11, ibu: 45,
      tags: ["NEIPA", "quad IPA", "крепкий", "охмелённый", "насыщенное"],
      description: "Предельно крепкий среди супер-охмелённых: Quad IPA с насыщенной текстурой и максимальной засыпью хмеля. Серия Dozen." },
    { name: "Dozen Russian Imperial Stout", styleRaw: "Russian Imperial Stout", category: "stout-porter", abv: 16,
      tags: ["Russian Imperial Stout", "кофе", "ваниль", "крепкий", "плотный", "десертный"],
      description: "Крепчайший стаут с кофе и ванилью: максимально плотный и тягучий десерт для неторопливой дегустации. Серия Dozen." },
  ]},
  { brewerySlug: "big-village-brewery", handle: "big_village_brew", releases: [
    { name: "ВСПЯТЬ", styleRaw: "American Pale Ale (West Coast)", category: "pale-ale", abv: 5.5, plato: 13,
      tags: ["APA", "West Coast", "сухой", "горький", "Mosaic", "Nelson Sauvin"],
      description: "Пейл-эль западного побережья: светлый, сухой, уверенная горечь, освежающий аромат тандема Mosaic/Nelson Sauvin." },
    { name: "ПАРЕЙДОЛИЯ", styleRaw: "Hoppy Weizen", category: "wheat", abv: 5.5, plato: 14,
      tags: ["Hoppy Weizen", "пшеничное", "банан", "ваниль", "Riwaka", "El Dorado", "collab"],
      description: "Охмелённый вайсбир: освежающий, мягкий, бананово-ванильный аромат, тандем Riwaka/El Dorado. Коллаб с баром «ОПЫТ» (Екатеринбург)." },
    { name: "WILD HARVEST", styleRaw: "Graff", category: "specialty", abv: 6, plato: 13,
      tags: ["Graff", "сидр-гибрид", "яблоко", "фруктовый", "кислотность", "сухой финиш"],
      description: "Гибрид светлого эля и сидра: солодовая база + сок кубанских яблок. Фруктовый аромат, освежающая кислотность, сухой финиш." },
    { name: "MELTING SOUL", styleRaw: "DDH NEIPA", category: "ipa", abv: 7, plato: 17,
      tags: ["DDH NEIPA", "hazy", "овсяные хлопья", "Strata", "Riwaka", "Nelson Sauvin"],
      description: "Хейзи IPA с овсяными и пшеничными хлопьями, охмелён Strata/Riwaka/Nelson Sauvin Amplifire." },
    { name: "ПРЕДИСЛОВИЕ", styleRaw: "West Coast IPA", category: "ipa", abv: 7, plato: 16,
      tags: ["West Coast IPA", "сухой", "горький", "Krush", "Citra", "Nelson Sauvin"],
      description: "Светлый сухой горький WC IPA, охмелён Krush/Citra/Nelson Sauvin." },
    { name: "ШТРАФНОЙ", styleRaw: "Light Lager", category: "lager", abv: 4, plato: 10,
      tags: ["Light Lager", "светлый", "лёгкий", "освежающий", "хрустящий"],
      description: "Максимально светлый, лёгкий, освежающий и хрустящий лагер с тонким хмелевым ароматом." },
    { name: "URBAN FLOW", styleRaw: "DDH NEIPA", category: "ipa", abv: 7, plato: 17,
      tags: ["DDH NEIPA", "hazy", "овсяные хлопья", "Galaxy", "Mosaic", "Nectaron"],
      description: "Хейзи IPA с овсяными и пшеничными хлопьями, охмелён Galaxy/Mosaic/Nectaron." },
  ]},
];

const db = openDb(DB_PATH);
const tg = (handle: string) => `https://t.me/${handle}`;
let added = 0;
const perBrewery: { brewery: string; n: number }[] = [];

for (const ch of CHANNELS) {
  const row = db.query("SELECT id, name FROM breweries WHERE slug = ?").get(ch.brewerySlug) as
    { id: string; name: string } | null;
  if (!row) { console.warn(`! пивоварня не найдена: ${ch.brewerySlug}`); continue; }

  for (const r of ch.releases) {
    const st = categorizeStyle(r.styleRaw);
    // если таксономия не распознала — берём категорию из агентного извлечения
    const category = st.category !== "unknown" ? st.category : (r.category as typeof st.category);
    upsertBeer(db, {
      name: r.name, breweryId: row.id, breweryNameRaw: row.name,
      abv: r.abv ?? undefined, ibu: r.ibu ?? undefined,
      status: "validated", // характеристики из офиц. канала пивоварни
      style: { slug: st.slug, name: r.styleRaw, category },
      source: { url: tg(ch.handle), excerpt: r.description, seenAt },
    });
    added++;
  }
  perBrewery.push({ brewery: row.name, n: ch.releases.length });
}

console.log("Сортов добавлено:", added);
for (const p of perBrewery) console.log(`  ${p.brewery}: ${p.n}`);
console.log("STATS:", JSON.stringify(stats(db)));
db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
db.close();
