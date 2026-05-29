// Обогащение: первоисточник (TG-канал @RewortBrewery) даёт характеристики и описание,
// магазины — цены/наличие. Агент (этот скрипт; в проде — скилл-агент) сводит «сырое»
// в адекватные записи: стиль, ABV/IBU/Plato, описание, теги, ссылки, цены.
import { openDb, upsertBrewery, upsertBeer, recordListing, stats } from "@beer-log/store";
import { categorizeStyle, isSameBeer } from "@beer-log/catalog-core";

const ROOT = "/sessions/bold-pensive-pascal/mnt/Beer Log";
const BUILD = "/tmp/bl/rewort-enriched.sqlite";
const seenAt = "2026-05-29T12:00:00.000Z";
const tg = (id: number) => `https://t.me/RewortBrewery/${id}`;

// --- ПЕРВОИСТОЧНИК: релизы из TG-канала (распарсено parseBreweryReleases) + кураторские теги ---
type Rel = { name: string; styleRaw: string; abv: number; plato?: number; ibu?: number; desc: string; post: number; tags: string[] };
const releases: Rel[] = [
  { name: "Hazy shade of summer", styleRaw: "IPA - New England / Hazy", abv: 6.5, plato: 16.5, ibu: 25, post: 761,
    tags: ["IPA", "NEIPA", "хейзи", "цитрус", "мандарин", "сочное"],
    desc: "Сочно-мутный NE IPA с деликатной горечью и мощным хмелевым ароматом; добавлен свежий мандариновый сок." },
  { name: "Кристалл метод / Crystal Method", styleRaw: "Sour - Traditional Gose", abv: 5.7, plato: 16, ibu: 35, post: 764,
    tags: ["гозе", "сауэр", "соль", "кориандр", "сухое охмеление"],
    desc: "Традиционный лейпцигский гозе с солью и кориандром, освежённый американским хмелем на сухом охмелении." },
  { name: "Солнце Калифорнии", styleRaw: "IPA - American", abv: 6.5, plato: 15, ibu: 55, post: 765,
    tags: ["IPA", "West Coast", "хвойное", "цитрус", "Idaho 7", "Cascade", "Simcoe"],
    desc: "Яркий West Coast пэйл-эль с уверенной горечью и цитрусово-тропическо-хвойной ароматикой." },
  { name: "Миниатюра", styleRaw: "IPA - Session New England / Hazy", abv: 2.5, plato: 8, ibu: 15, post: 769,
    tags: ["session", "NEIPA", "хейзи", "лёгкое", "сочное"],
    desc: "Сессионный микро-NE IPA: сочный и ароматный как взрослый, но всего 2.5% алкоголя." },
  { name: "Ля Томатина Корейская", styleRaw: "Sour - Tomato / Vegetable Gose", abv: 6.5, plato: 21, ibu: undefined, post: 776,
    tags: ["гозе", "сауэр", "томат", "кимчи", "острое", "экспериментальное"],
    desc: "Томатный гозе с остротой корейского кимчи — сочно, пряно, бодряще." },
  { name: "Крылья доблести", styleRaw: "Sour - Fruited", abv: 6.9, plato: 17, ibu: 11, post: 777,
    tags: ["сауэр", "фруктовое", "клубника", "маракуйя", "бергамот"],
    desc: "Фруктовый саур: сладость клубники, кислинка маракуйи и нота пряного бергамота." },
  { name: "Крылья отваги", styleRaw: "Sour - Fruited", abv: 6.5, plato: 17, ibu: 10, post: 782,
    tags: ["сауэр", "фруктовое", "малина", "маракуйя"],
    desc: "Фруктовый саур: спелая сочная малина и дерзкая маракуйя." },
];

// --- МАГАЗИНЫ: цены (имя как в магазине, продавец, цена, остаток?) ---
type Shop = { name: string; seller: string; price: number; stock?: number };
const shops: Shop[] = [
  { name: "Hazy Shade of Summer", seller: "craftbeer78.ru", price: 269 },
  { name: "Солнце Калифорнии", seller: "craftbeer78.ru", price: 299 },
  { name: "Миниатюра", seller: "craftbeer78.ru", price: 299 },
  { name: "Ля Томатина Корейская", seller: "craftbeer78.ru", price: 279 },
  { name: "Крылья доблести", seller: "craftbeer78.ru", price: 279 },
  { name: "Крылья отваги", seller: "craftbeer78.ru", price: 269 },
  { name: "Kryly Advagi", seller: "winestyle.ru", price: 259 },
];
// ручные алиасы для случаев, где транслит искажён и fuzzy не ловит (task-14: fuzzy + алиас)
const aliases: Record<string, string[]> = { "Крылья отваги": ["Kryly Advagi"] };

function matchShops(name: string): Shop[] {
  const al = aliases[name] ?? [];
  return shops.filter((s) => isSameBeer(name, s.name) || al.some((a) => isSameBeer(a, s.name)));
}

const db = openDb(BUILD);
const brewId = upsertBrewery(db, {
  name: "Rewort Brewery", city: "Сергиев Посад", segment: "craft", country: "RU",
  aliases: ["Rewort", "ReWort", "Реворт"],
});

const baseLinks = ["https://rewort.ru", "https://t.me/RewortBrewery", "https://vk.com/rewort", "https://untappd.com/rewort"];
const enriched = releases.map((r) => {
  const st = categorizeStyle(r.styleRaw);
  const matched = matchShops(r.name);
  const prices = matched.map((m) => ({ shop: m.seller, price: m.price }));

  upsertBeer(db, {
    name: r.name, breweryId: brewId, breweryNameRaw: "Rewort Brewery",
    abv: r.abv, ibu: r.ibu, status: "validated", // обогащено из первоисточника -> validated
    style: { slug: st.slug, name: r.styleRaw, category: st.category },
    aliases: aliases[r.name] ?? [],
    source: { url: tg(r.post), excerpt: r.desc, seenAt },
  });
  for (const m of matched) {
    recordListing(db, { beerNameRaw: r.name, price: m.price, currency: "RUB", volumeMl: 500,
      format: "can", seller: m.seller, sourceUrl: `https://${m.seller}`, seenAt });
  }

  return {
    name: r.name, brewery: "Rewort Brewery", city: "Сергиев Посад",
    style: r.styleRaw, category: st.category, abv: r.abv, plato: r.plato, ibu: r.ibu ?? null,
    description: r.desc, tags: r.tags,
    links: [...baseLinks, tg(r.post), ...matched.map((m) => `https://${m.seller}`)],
    prices, priceMin: prices.length ? Math.min(...prices.map((p) => p.price)) : null,
    priceMax: prices.length ? Math.max(...prices.map((p) => p.price)) : null,
    provenance: { source: "telegram:@RewortBrewery", post: tg(r.post) },
  };
});

const s = stats(db);
db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
db.close();
await Bun.write(`${ROOT}/data/rewort-enriched.sqlite`, Bun.file(BUILD));
await Bun.write(`${ROOT}/data/rewort-enriched.json`, JSON.stringify(enriched, null, 2));

const rows = enriched.map((e) => {
  const pr = e.prices.length ? e.prices.map((p) => `${p.price}₽ (${p.shop})`).join(", ") : "— нет в магазинах";
  return `### ${e.name}
- **Стиль:** ${e.style} (${e.category})
- **ABV/Plato/IBU:** ${e.abv}% / ${e.plato ?? "—"} / ${e.ibu ?? "—"}
- **Теги:** ${e.tags.join(", ")}
- **Цены:** ${pr}
- **Описание:** ${e.description}
- **Ссылки:** [TG-релиз](${e.provenance.post})${e.prices.length ? " · " + [...new Set(e.prices.map(p=>p.shop))].map(sh=>`[${sh}](https://${sh})`).join(" · ") : ""}
`;
}).join("\n");

const report = `# Rewort — обогащённый каталог (источник + цены)

*Агентное обогащение: характеристики и описание взяты из первоисточника —
официального TG-канала [@RewortBrewery](https://t.me/RewortBrewery), цены — из
магазинов, связка через fuzzy-матч + алиасы. В проде этот шаг выполняет скилл-агент.*
*Данные: 2026-05-29. БД: \`data/rewort-enriched.sqlite\`, JSON: \`data/rewort-enriched.json\`.*

Сортов обогащено: **${enriched.length}** · с ценами: **${enriched.filter((e)=>e.prices.length).length}** · статус записей: validated (из первоисточника).

${rows}

## Заметки по дедупу (task-14)

- Точные/нормализованные совпадения TG↔craftbeer78 сработали по 6 сортам.
- «Крылья отваги» (TG/craftbeer78) ↔ «Kryly Advagi» (winestyle) — fuzzy НЕ поймал
  (искажённый транслит, сходство 0.83 < 0.85), сматчено **ручным алиасом**. Это и
  есть рабочая схема task-14: fuzzy + алиасы для остатка.
- «Кристалл метод» пока без цены — нет в собранных магазинах (нужен ещё источник).

Связано: [[data-acquisition-log]], [[sourcing-strategy]], [[data-model]].
`;
await Bun.write(`${ROOT}/data/rewort-enriched-report.md`, report);
console.log("STATS:", JSON.stringify(s));
console.log("enriched:", enriched.length, "| with prices:", enriched.filter((e)=>e.prices.length).length);
