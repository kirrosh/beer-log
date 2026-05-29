// Офлайн-ингест собранных данных russiancraftbeer в каталог + отчёт.
// Данные получены через санкционированный web-fetch и сохранены в data/rcb-export.md.
// БД собирается в локальной песочнице (WAL не работает на смонтированной папке),
// затем готовый файл копируется в data/.
import { openDb, upsertBrewery, upsertBeer, stats } from "@beer-log/store";
import { parseRcbExport } from "@beer-log/parsers";
import { categorizeStyle } from "@beer-log/catalog-core";

const ROOT = "/sessions/bold-pensive-pascal/mnt/Beer Log";
const BUILD = "/tmp/bl/beer-log.sqlite";

const text = await Bun.file(`${ROOT}/data/rcb-export.md`).text();
const rcb = parseRcbExport(text);

const db = openDb(BUILD);
const breweries = [...rcb.breweries].sort((a, b) => a.localeCompare(b, "ru"));
for (const name of breweries) upsertBrewery(db, { name, segment: "craft", country: "RU" });

for (const b of rcb.beers) {
  const st = categorizeStyle(b.styleRaw);
  upsertBeer(db, {
    name: b.name,
    status: "auto",
    style: { slug: st.slug, name: st.category === "unknown" ? b.styleRaw : st.name, category: st.category },
  });
}

const s = stats(db);
db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");
db.close();

const beerRows = rcb.beers.map((b) => {
  const st = categorizeStyle(b.styleRaw);
  return `| ${b.name} | ${b.styleRaw} | ${st.category} |`;
}).join("\n");

const report = `# Каталог Beer Log — отчёт сбора данных

*Источник: реестр russiancraftbeer.ru (страница /export), собрано 2026-05-29 через web-fetch.*
*Это частичная витрина реестра (≈10 заведений + блок «новое»); полный обход реестра и TG-каналов — на машине через \`scripts/build-catalog.ts\`.*

## Итоги

- Пивоварни: **${s.breweries}**
- Сорта: **${s.beers}**
- Заведения (распознано): **${rcb.venues.length}**
- Листинги цен: ${s.listings} (в этом источнике цен нет — появятся из TG/магазинов, см. сигнал скидок)

## Пивоварни (${breweries.length})

${breweries.map((b) => `- ${b}`).join("\n")}

## Сорта и категоризация стиля

| Сорт | Стиль (исходный) | Категория (наша) |
|---|---|---|
${beerRows}

## Заведения

${rcb.venues.map((v) => `- ${v.name}`).join("\n")}

---
БД: \`data/catalog.sqlite\` (SQLite). Примеры запросов:
\`\`\`sql
SELECT name, city, segment FROM breweries ORDER BY name;
SELECT name, style_name, style_category FROM beers;
\`\`\`
`;
await Bun.write(`${ROOT}/data/catalog-report.md`, report);
await Bun.write(`${ROOT}/data/catalog.sqlite`, Bun.file(BUILD)); // копия готового файла в папку

console.log("STATS:", JSON.stringify(s));
console.log("breweries:", breweries.length, "| beers:", rcb.beers.length, "| venues:", rcb.venues.length);
