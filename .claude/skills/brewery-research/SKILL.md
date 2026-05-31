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
     Проверь raw-fetch HTTP 200 И **реальные блоки**: `data-bid="` встречается >0 раз ЛИБО
     счётчик `>N Beers</a>` с N>0. ⚠️ НЕ доверяй наличию строки `class="beer-item"` — она есть
     в JS-шаблоне (`_item_selector`) даже у пивоварен с пустым/JS-рендер списком (0 сортов,
     как victory-art-brew/monkfish): такие отдают 0 при ингесте. Лучший структурный источник сортов.
   - **VK** — `vk.com/<group>` (часто дублирует TG; парсер VK — TODO).
   - **Сайт** — офиц. домен (каталог редко структурный; обычно ведёт в TG/VK/Untappd).
   - **2ГИС/Яндекс.Карты** — для брёвпабов/городской привязки (позже для demand по городу).
3. Запиши находки в `breweries.links` (kind: telegram|vk|website|untappd). Один источник =
   одна запись; `upsertBrewery` мержит по url и заполняет пустой `city`. Записать TG-/untappd-ссылку
   в `links` ДОСТАТОЧНО — отдельно `ingest-hints.json` руками НЕ трогай: TG-канал подхватит
   `fetch-channels` сидом из links, untappd-URL берёт `ingest-untappd` тоже из links.
   - **Соло/последовательно** (один ресёрч за раз) — пиши прямо в БД:
     `bun -e "import {openDb,upsertBrewery} from '@beer-log/store';const db=openDb('data/catalog.sqlite');upsertBrewery(db,{name:'<Name>',slug:'<slug>',city:'<город>',links:[{kind:'untappd',url:'...'},{kind:'telegram',url:'...'}]});db.exec('PRAGMA wal_checkpoint(TRUNCATE);');db.close()"`
   - **Параллельно субагентами** (оркестратор pipeline-run, ≤5 разом) — субагенты в БД НЕ пишут
     (sqlite — один писатель, параллель = гонки/`database is locked`). Каждый ВОЗВРАЩАЕТ строгий
     JSON `{slug, city, links:[{kind,url,verified,note}], tgHandle, untappdBeerListUrl, blocked}`,
     а оркестратор применяет результаты ПОСЛЕДОВАТЕЛЬНО (один `upsertBrewery`-проход на батч).
4. Если источников нет/всё закрыто → отметь блокер в `data/pipeline/overrides.json`
   (`breweries.<slug>.blocked = "<причина>"`, опц. `blockedAt`), чтобы не возвращаться.
5. Дальше — стадия `ingested` (отдельная итерация конвейера): ссылка уже в `links`, поэтому
   ингест запускается без ручной правки скриптов — Untappd → `ingest-untappd.ts <slug…>`
   (URL из links); TG → `fetch-channels.ts <slug…>` + агентное извлечение + `ingest-sorts.ts`.

## Правила
- Верифицируй активность (живой канал/чек-ины), не доверяй устаревшим реестрам.
- Хэндлы только проверенные (`t.me/s/`), не выдуманные.
- Один источник = одна запись в links; дубли по url не плодить (upsertBrewery мержит).

Связано: `vault/product/sourcing-strategy.md`, `vault/product/operating-pipeline.md`,
`scripts/ingest-untappd.ts`, `data/ingest/RUNBOOK.md`.
