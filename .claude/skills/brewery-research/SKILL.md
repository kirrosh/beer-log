---
name: brewery-research
description: Ресёрч источников одной пивоварни — найти и верифицировать все офиц. каналы (Telegram, VK, сайт, Untappd, 2ГИС/карты), записать в breweries.links и ingest-hints. Используй, когда в очереди pipeline-status есть "brewery-research", или по запросу "найди источники <пивоварни>".
---

# Ресёрч источников пивоварни

Цель стадии `discovered → sourced`: для пивоварни найти ВСЕ публичные источники, из
которых потом тянуть сорта/цены. Один источник ненадёжен (sourcing-strategy:
многоисточниковость), поэтому собираем все.

## Шаги

1. Контекст пивоварни: `bun -e "import {Database} from 'bun:sqlite';const d=new Database('data/catalog.sqlite',{readonly:true});console.log(d.query('SELECT name,city,country,aliases,links FROM breweries WHERE slug=?').get('<SLUG>'))"`
2. Веб-ресёрч (WebSearch/WebFetch) — найти и **верифицировать живость** (свежие посты/
   чек-ины 2025-26), не выдумывать:
   - **Telegram** — офиц. канал (`t.me/<handle>`). Проверь, что превью `t.me/s/<handle>`
     отдаёт ленту (если визитка/закрыто — пометь, источник = Untappd/VK). Узнай макс. post id.
   - **Untappd** — `untappd.com/<Brewery>/beer` или `/w/<slug>/<id>/beer` (брёвпабы).
     Проверь raw-fetch (HTTP 200, есть `.beer-item`). Лучший структурный источник сортов.
   - **VK** — `vk.com/<group>` (часто дублирует TG; парсер VK — TODO).
   - **Сайт** — офиц. домен (каталог редко структурный; обычно ведёт в TG/VK/Untappd).
   - **2ГИС/Яндекс.Карты** — для брёвпабов/городской привязки (позже для demand по городу).
3. Запиши находки:
   - в `breweries.links` через `upsertBrewery` (kind: telegram|vk|website|untappd):
     `bun -e "import {openDb,upsertBrewery} from '@beer-log/store';const db=openDb('data/catalog.sqlite');upsertBrewery(db,{name:'<Name>',slug:'<slug>',links:[{kind:'untappd',url:'...'},{kind:'telegram',url:'...'}]});db.exec('PRAGMA wal_checkpoint(TRUNCATE);');db.close()"`
   - TG-источник — в `data/ingest-hints.json` (канал/newestId/status), как делает ingest-sorts.
4. Если источников нет/всё закрыто → отметь блокер в `data/pipeline/overrides.json`
   (`breweries.<slug>.blocked = "нет публичных источников"`), чтобы не возвращаться.
5. Дальше — стадия `ingested`: запусти подходящий ингест (Untappd → добавь в
   `scripts/ingest-untappd.ts` MAP; TG → `fetch-channels`+`ingest-sorts`).

## Правила
- Верифицируй активность (живой канал/чек-ины), не доверяй устаревшим реестрам.
- Хэндлы только проверенные (`t.me/s/`), не выдуманные.
- Один источник = одна запись в links; дубли по url не плодить (upsertBrewery мержит).

Связано: `vault/product/sourcing-strategy.md`, `vault/product/operating-pipeline.md`,
`scripts/ingest-untappd.ts`, `data/ingest/RUNBOOK.md`.
