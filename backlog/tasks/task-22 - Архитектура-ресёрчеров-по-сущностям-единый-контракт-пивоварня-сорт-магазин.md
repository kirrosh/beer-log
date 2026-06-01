---
id: TASK-22
title: >-
  Архитектура «ресёрчеров» по сущностям: единый контракт (пивоварня / сорт /
  магазин) — skill + скрипты + инструкции + данные
status: To Do
assignee: []
created_date: '2026-06-01 17:10'
labels:
  - pipeline
  - infra
  - architecture
milestone: 'M3: Глубина и надёжность каталога'
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Идея (Кирилл, 2026-06-01): у каждой СУЩНОСТИ — свой «ресёрчер»: самодостаточный
набор **skill + скрипты + инструкции + данные**, владеющий полным жизненным циклом
этой сущности. Сейчас тулинг разложен по СТАДИЯМ, а жизненный цикл сущности размазан.

**Текущее состояние (по факту):**
- Скиллы по стадиям: `brewery-research` (источники), `promote-sorts` (auto→validated),
  `shop-discovery` (магазины), `pipeline-run` (оркестратор).
- Скрипты — частью по источнику, частью по стадии. Сорта: `fetch-channels` +
  `ingest-sorts` + `ingest-untappd(-collected)` + `catalog-matcher` + `rematch-listings`.
  Магазины: **bespoke-скрипт на каждый магазин** — `ingest-shop`, `ingest-shop-full`,
  `ingest-storebeer`, `ingest-pivokom`, `ingest-kraftbeer`, `ingest-rusbeershop`,
  `ingest-vashchehov`. Новый магазин/бар = новый скрипт.
- Данные per-instance: ad-hoc формы — `research/<slug>.json` (пивоварни),
  `promotions/<slug>.json` (сорта), `shops.json` (магазины, уже довольно единый реестр).
- Control-plane уже есть: `pipeline-status.ts --plan` отдаёт JSON-очередь
  (`action/priority/count/slugs`), которую потребляет `pipeline-run`.

**Чего не хватает:** единого СУЩНОСТНОГО контракта «ресёрчера» поверх этого
control-plane. Из-за этого (а) per-source ingest-скрипты плодятся, (б) формы данных и
границы skill/скрипт у каждой сущности свои, (в) онбординг новой сущности-инстанса не
единообразен, (г) знание разнесено между skill/скриптами/раннбуками/памятью.

**Цель — НЕ переписать рабочий конвейер, а формализовать и консолидировать** его в
единый сущностный контракт. Каждый ресёрчер реализует общий жизненный цикл и
подключается к существующему `pipeline-status`/`pipeline-run`. Задача — архитектурная
(дизайн + первый срез), порождает под-задачи по сущностям.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Определён контракт «Ресёрчера»: общие глаголы жизненного цикла (discover → research/source → ingest/parse → match/dedup → validate/curate → refresh → report-stage), единая конвенция per-instance state, model-тиринг (haiku/sonnet/opus, см. память), гейты (human-review)
- [ ] #2 Контракт описан в вики (новая `vault/product/entity-researchers.md` + правки `operating-pipeline.md` и `AGENTS.md`); каждый ресёрчер декларирует, какие действия `pipeline-status --plan` он owns
- [ ] #3 Существующее разложено по бандлам сущностей (манифест на сущность: какой skill, какие скрипты, какой раннбук, какие data-файлы) — без переписывания, организация того, что есть
- [ ] #4 Явно выписаны пробелы по каждой сущности (см. ниже) с приоритетами и под-задачами
- [ ] #5 Первый консолидационный срез реализован: единый shop-ingest по платформе (bitrix/woocommerce/insales/custom-json/telegram) — новый магазин = конфиг в `shops.json`, а не новый bespoke-скрипт. На нём контракт проверен «в бою»
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Сущности и их бандлы (формализуем существующее + пробелы):**

1. **Brewery-ресёрчер** — `discovered → sourced → ingested → validated → demand_linked`.
   - Есть: skill `brewery-research`; скрипты `seed-breweries`/`seed-rcb`/`seed-top`,
     `apply-research`; данные `research/<slug>.json`, `ingest-hints.json`,
     `breweries.links`, `overrides`(blocked).
   - Пробел: цикл **refresh/liveness** (источники устаревают) — нет переобхода.

2. **Sort/Beer-ресёрчер** — `ingest(TG/Untappd) → match → promote → provenance`.
   - Есть: skill `promote-sorts`; скрипты `fetch-channels`/`ingest-sorts`/
     `ingest-untappd(-collected)`/`catalog-matcher`/`rematch-listings`; раннбуки
     `RUNBOOK.md`/`breadth-backfill.md`; данные `promotions/<slug>.json`, `sorts-<date>/`.
   - Пробел: не собран как один связный ресёрчер; VK-источник (task-13); провенанс-метки
     (task-21).

3. **Shop-ресёрчер** — `discovered → parseable → scanned → recurring`.
   - Есть: skill `shop-discovery`; единый реестр `shops.json` (id/platform/status/
     lastScan/ingest/note — уже хорош); парсеры `parseInsalesProducts` и пр.
   - Пробел (ГЛАВНЫЙ): **нет единого ingest-интерфейса по платформе** → bespoke-скрипт
     на магазин (7 шт). + цикл **recurring/freshness** + само-восстановление парсера
     ([[parser-architecture]], task-5). Бары = подтип (`platform=telegram`), уже в реестре.

4. **(City/geo)** — `discovered → shops_found → shops_scanned`. Скорее сквозной
   scope-юнит, не полноценный ресёрчер; решить — тонкий geo-вью или часть shop-ресёрчера.

**Контракт (предлагаемая форма, уточнить в #1):** ресёрчер = логический бандл (skill в
`.claude/skills/`, скрипты в `scripts/`, раннбук-инструкция, per-instance state в
`data/`), декларирующий: владеемые действия очереди, входы для деривации стадии
`pipeline-status`, model-тиринг, гейты. Спайн оркестрации (`pipeline-status --plan` →
`pipeline-run`) НЕ трогаем — ресёрчеры в него подключаются единообразно.

**Подход:** дизайн+документация (#1-4) шиппятся как чистая консолидация; #5 (единый
shop-ingest) — proof-срез, самый высокий практический выигрыш (убирает рост
bespoke-скриптов). Под-задачи по сущностям (brewery-refresh, sort-bundle+VK,
shop-unified-ingest, recurring-freshness) заводим из #4.

**Связано:** [[operating-pipeline]], [[autonomy]] (~95% автономии — это её конкретная
форма), [[parser-architecture]] (само-восстановление парсеров на уровне shop-ресёрчера),
[[sourcing-strategy]]; память: model-тиринг субагентов, breadth-backfill,
draft-bar-tg-taplist. Не дублировать существующие скиллы — задача их БАНДЛИТ.
<!-- SECTION:NOTES:END -->
