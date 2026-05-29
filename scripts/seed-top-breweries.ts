// Сид топовых крафтовых пивоварен РФ с офиц. ссылками (сайт + Telegram + VK/Untappd).
// Данные верифицированы ресёрчем по вебу 2026-05-29 (превью t.me/s/<handle> + офсайты).
// Слой Discovery (task-12): кто существует + их офиц. каналы → база для ингеста сортов (task-13).
// Запуск: bun run scripts/seed-top-breweries.ts   (пишет в data/catalog.sqlite, env DB_PATH опц.)
import { openDb, upsertBrewery, stats, type BreweryLink } from "@beer-log/store";

const DB_PATH = process.env.DB_PATH ?? "data/catalog.sqlite";
const seenAt = "2026-05-29";

type Seed = {
  name: string;
  slug?: string; // привязка к существующей записи каталога, если slugify(name) не совпал
  city: string;
  aliases: string[];
  site?: string;
  telegram?: string; // только подтверждённые офиц. каналы; не выдумываем
  vk?: string;
  untappd?: string;
  note: string;
  confidence: "high" | "med";
};

// 16 верифицированных пивоварен. Отброшены как неподтверждённые/закрытые:
// Mad Brewlab, Brick Stone, Wylde Brew (не существуют как рос. пивоварни), ДНК Brewery (закрыта).
const SEEDS: Seed[] = [
  { name: "AF Brew", slug: "afbrew", city: "Санкт-Петербург",
    aliases: ["Afbrew", "АФ Брю", "AntiFactory Brew"],
    site: "https://afbrew.co/", telegram: "https://t.me/afbrewandco",
    vk: "https://vk.com/afbrew", untappd: "https://untappd.com/AntiFactory",
    note: "Пионер рос. крафта (2012): хмелевые IPA/NEIPA, безалк. серии, сеть баров, фест Lobotomy Day.", confidence: "high" },
  { name: "Бакунин", city: "Санкт-Петербург",
    aliases: ["Bakunin", "Bakunin Brewery"],
    site: "https://bakuninbrewery.com/", telegram: "https://t.me/bakunin_telegram",
    vk: "https://vk.com/bakuninbrewery", untappd: "https://untappd.com/BakuninBrewery",
    note: "С 2013, выросла из пивного кафе. 200+ стилей, международная известность.", confidence: "high" },
  { name: "Stamm Brewing", city: "Красная Пахра (Москва, ТиНАО)",
    aliases: ["Stamm Beer", "Штамм Брювинг"],
    site: "https://stammbeer.ru/", telegram: "https://t.me/stammbeer",
    untappd: "https://untappd.com/StammBeer",
    note: "Семейная пивоварня (2011), свой ресторан/боттлшоп. NEIPA, DIPA, барливайны, бочковые выдержки.", confidence: "high" },
  { name: "Zagovor Brewery", city: "Мытищи (Московская обл.)",
    aliases: ["Заговор", "Zagovor"],
    site: "https://zagovorbrewery.com/", telegram: "https://t.me/zagovorbrewery",
    vk: "https://vk.com/zagovorbrewery", untappd: "https://untappd.com/ZagovorBrewery",
    note: "Бренд с 2014, своё производство с 2017. Охмелённые IPA, фруктовые сауры, десертные стауты.", confidence: "high" },
  { name: "Selfmade Brewery", city: "Москва",
    aliases: ["Selfmade", "Селфмэйд Брювери"],
    site: "https://selfmadebrewery.com/", telegram: "https://t.me/selfmadebrew",
    vk: "https://vk.com/public131675523",
    note: "С 2016, известна в РФ и Европе. Гик-культура и коллаборации с музыкантами/художниками.", confidence: "high" },
  { name: "Jaws Brewery", slug: "jaws-brewery", city: "Заречный (Свердловская обл.)",
    aliases: ["Джоус", "Jaws Brew"],
    site: "https://jawsbeer.ru/", telegram: "https://t.me/jawsbrewery",
    vk: "https://vk.com/jawsbrewery", untappd: "https://untappd.com/JawsBrew",
    note: "Одна из топовых рос. пивоварен (2008). 'Атомная прачечная' — один из первых IPA в РФ. Сеть баров Jawsspot.", confidence: "high" },
  { name: "Salden's", city: "Тула",
    aliases: ["Салденс", "Saldens Brewery"],
    site: "https://www.saldens.ru/", telegram: "https://t.me/saldensbrewery",
    vk: "https://vk.com/saldens", untappd: "https://untappd.com/SaldensBrewery",
    note: "Крупная тульская пивоварня (2012), 600+ сортов, сеть тапхаусов в Туле и Москве, дикое брожение.", confidence: "high" },
  { name: "Victory Art Brew", slug: "victory-art-brew", city: "Ивантеевка (Московская обл.)",
    aliases: ["Виктори Арт Брю", "VAB"],
    site: "https://victoryartbrew.com/", vk: "https://vk.com/victoryartbrew",
    untappd: "https://untappd.com/v/victory-art-brew/2040839",
    note: "С 2013, в 2016 названа RateBeer лучшей в РФ. Офиц. публичный TG-канал не подтверждён — соцсети в VK.", confidence: "med" },
  { name: "Konix Brewery", city: "Заречный (Пензенская обл.)",
    aliases: ["Коникс", "KONIX"],
    site: "https://konixbrewery.ru/", telegram: "https://t.me/konix_brewery",
    vk: "https://vk.com/konix_brewery",
    note: "С 2002 (эксперименты с 2008). Анонсы релизов, коллабы, IPA/стауты.", confidence: "high" },
  { name: "4 Brewers", city: "Владимир",
    aliases: ["4BREWERS", "Четыре пивовара", "Four Brewers"],
    site: "https://4brewers.ru/", telegram: "https://t.me/fourbrewers",
    untappd: "https://untappd.com/4Brewers",
    note: "Владимирская пивоварня (домашнее с 2010, завод с 2016) с пабом в Москве. Эксперим. гозе, кислые эли, IPA.", confidence: "high" },
  { name: "Plan B Brewery", city: "Ярославль",
    aliases: ["Plan B", "План Б", "Plan-B"],
    site: "https://planbrew.ru/", vk: "https://vk.com/planb_brewery",
    untappd: "https://untappd.com/Plan_B_Brewery",
    note: "Ярославская пивоварня (2013). IPA, хмелевые релизы, плотные тёмные; флагман 'Ковбой Мальборо'. TG не подтверждён.", confidence: "med" },
  { name: "Big Village Brewery", slug: "big-village-brewery", city: "Краснодар",
    aliases: ["Big Village", "Биг Вилладж", "BVB"],
    telegram: "https://t.me/big_village_brew", untappd: "https://untappd.com/BVBrewery",
    note: "Краснодарская пивоварня (контракт 2015, своё с 2018). Линейки VILLAGE/CITY: IPA/NEIPA/APA, fruited sour.", confidence: "high" },
  { name: "Brewlok", slug: "brewlok", city: "Воронеж",
    aliases: ["Брюлок", "Brewlok Brewery"],
    site: "https://brewlok.ru/", telegram: "https://t.me/brewlokbrewery",
    vk: "https://vk.com/brewlokbrewery", untappd: "https://untappd.com/BrewlokBrewery",
    note: "Воронежская «читающая пивоварня» (2015): тематические серии, barleywine/wild ale, IPA, сауры.", confidence: "high" },
  { name: "HopHead Brewery", slug: "hophead-brewery", city: "Санкт-Петербург",
    aliases: ["ХопХэд", "HopHead Craft Brewery"],
    site: "http://hopheadbrewery.ru/", telegram: "https://t.me/hopheadbrewery",
    vk: "https://vk.com/hopheadbrewery",
    note: "Питерская пивоварня (2015), эксперим. сорта; известна суп-гозе (Phở и др.). TG-хэндл с офсайта.", confidence: "med" },
  { name: "1516 Brewery", slug: "1516-brewery", city: "Чехов (Московская обл.)",
    aliases: ["1516 Pub & Brewery", "1516 авторская пивоварня"],
    site: "https://www.1516pub.ru", untappd: "https://your.beer/brewery/1516-pub-brewery",
    note: "Авторская пивоварня + паб (Филипп Самарец), переехала из Москвы в Чехов. Lager/Pilsner/Weizen/Stout. TG не подтверждён.", confidence: "med" },
  { name: "Lighthouse Brew", slug: "lighthouse-brew", city: "Санкт-Петербург",
    aliases: ["Lighthouse Brewing", "Лайтхаус"],
    vk: "https://vk.com/lighthousebrew", untappd: "https://untappd.com/Lighthouse_Brew",
    note: "Микропивоварня СПб: barleywine, fruited gose/Berliner Weisse, imperial milk stout. Площадка — VK.", confidence: "med" },
];

function links(s: Seed): BreweryLink[] {
  const out: BreweryLink[] = [];
  if (s.site) out.push({ kind: "website", url: s.site, title: "Сайт" });
  if (s.telegram) out.push({ kind: "telegram", url: s.telegram, title: "Telegram (офиц.)" });
  if (s.vk) out.push({ kind: "vk", url: s.vk, title: "VK" });
  if (s.untappd) out.push({ kind: "untappd", url: s.untappd, title: "Untappd" });
  return out;
}

const db = openDb(DB_PATH);
for (const s of SEEDS) {
  upsertBrewery(db, {
    name: s.name, slug: s.slug, city: s.city, segment: "craft", country: "RU",
    aliases: s.aliases, links: links(s), canonicalName: true,
  });
}

// Отчёт по тому, что заведено
const withTg = SEEDS.filter((s) => s.telegram).length;
const rows = SEEDS.map((s) => {
  const ls = links(s).map((l) => `[${l.title}](${l.url})`).join(" · ");
  return `### ${s.name}\n- **Город:** ${s.city}${s.confidence === "med" ? " · _confidence: med_" : ""}\n- **Алиасы:** ${s.aliases.join(", ")}\n- **Ссылки:** ${ls}\n- ${s.note}\n`;
}).join("\n");

const report = `# Топовые крафтовые пивоварни РФ — офиц. ссылки (Discovery, task-12)

*Сид каталога: ${SEEDS.length} пивоварен с офиц. сайтами и Telegram-каналами. Данные
верифицированы ресёрчем по вебу ${seenAt} (превью \`t.me/s/<handle>\` + офсайты). Хэндлы
не выдумывались: где офиц. TG не подтверждён — поле пустое (см. _confidence: med_).*

С подтверждённым офиц. Telegram: **${withTg} из ${SEEDS.length}**.

Отброшены как неподтверждённые/закрытые: **Mad Brewlab**, **Brick Stone**, **Wylde Brew**
(не существуют как рос. крафт-пивоварни — вероятно ошибки названий), **ДНК Brewery**
(закрыта по Untappd; не путать с барнаульской сетью бир-шопов «ДНК»).

${rows}
Связано: [[data-acquisition-log]], [[sourcing-strategy]], [[telegram-sources]].
`;
await Bun.write("data/top-breweries-report.md", report);

console.log("Засеяно пивоварен:", SEEDS.length, "| с офиц. TG:", withTg);
console.log("STATS:", JSON.stringify(stats(db)));
db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
db.close();
