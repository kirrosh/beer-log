---
id: TASK-23
title: >-
  Единый shop-ingest по платформе: новый магазин = конфиг в shops.json, а не
  bespoke-скрипт (proof контракта ресёрчеров)
status: Done
assignee: []
created_date: '2026-06-01 17:40'
labels:
  - pipeline
  - infra
  - demand
milestone: 'M3: Глубина и надёжность каталога'
dependencies:
  - task-22
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Первый консолидационный срез контракта ресёрчеров ([[entity-researchers]], TASK-22 #5):
убрать рост bespoke-скриптов на каждый магазин. Сейчас новый магазин/бар = новый скрипт
(`ingest-storebeer`, `ingest-pivokom`, `ingest-kraftbeer`, `ingest-rusbeershop`,
`ingest-vashchehov`, + общие `ingest-shop`/`ingest-shop-full` — 7 шт). Каждый повторяет
один скелет: fetch каталога → парс товаров → matcher к канону → запись `price_listings`.

Цель — **единый ingest-интерфейс по ПЛАТФОРМЕ**: `bitrix` / `woocommerce` / `insales` /
`custom-json` / `telegram`. Магазин описывается КОНФИГОМ в `data/pipeline/shops.json`
(`platform`, `catalogUrl`, селекторы/поля платформы), а не отдельным скриптом. Это
proof контракта shop-ресёрчера «в бою»: глагол `ingest` становится одной реализацией,
параметризованной платформой.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Платформенный ingest-движок: `ingest-shop-platform.ts <id>` читает `ingestConfig` из `shops.json`, диспетчит на адаптер платформы, пишет листинги общим путём (`scripts/lib/shop-ingest.ts`: matcher + recordListing + stats/примеры, DRY/PAGES-override)
- [x] #2 Парсеры по платформе вынесены в `@beer-log/parsers` (`shops/platforms.ts`): `parseWoocommerce`/`parseBitrixCatalog`/`parseStorebeerPage`/`parseTelegramTapList` + общие `decodeEntities`/`parseVolumeMl`/`NONBEER`/`looksLikeBeerLine` — чистые, без сети
- [x] #3 `shops.json` расширен `ingestConfig` (platform/seller/idPrefix/endpoint/catalogs/idRegex/…); 5 магазинов мигрированы; **5 bespoke-скриптов удалены** (ingest-kraftbeer/pivokom/storebeer/rusbeershop/vashchehov)
- [x] #4 Полный регресс DRY (все страницы) пройден, тоталы сверены с живой БД: kraftbeer 295=295, pivokom 1770=1770, vashchehov 148=148 (точно); storebeer 1941 vs 1947 (±6: шире NONBEER + дрейф); rusbeershop 8797 — первый скан (раньше не сканировался, листингов в БД не было)
- [x] #5 Обновлены `operating-pipeline.md` (таблица скриптов) и манифест shop-ресёрчера в `entity-researchers.md`

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Реестр `shops.json` уже единый и несёт `platform`/`catalogUrl`/`ingest`/`note` — хорошая
база. Платформы по факту: woocommerce (kraftbeer — Store API JSON), bitrix
(pivokom/leolsbeer/rusbeershop — пагинация `?PAGEN_*`, часть на JS/AJAX), custom-json
(storebeer `json_get_items?page=N`, craftbeer78), telegram (vashchehov — тап-лист
`t.me/s/<канал>`), spa (wbtraditions — нужен рендер). Бары = `platform=telegram`
(память «draft-bar-tg-taplist»).

Не трогать спайн оркестрации — движок подключается к action `demand` как и сейчас.
Самовосстановление парсера (healthCheck→фиксер) — отдельно (TASK-5,
[[parser-architecture]]). Перескан по расписанию — TASK-25.

**Сделано (2026-06-01):** движок + чистые парсеры + конфиг 5 магазинов, typecheck чист,
смоук-DRY по всем 4 платформам зелёный (woocommerce/bitrix/custom-json/telegram). Сильный
сигнал эквивалентности: на telegram сорт-матч 67 = 47+20 из исходной заметки (с учётом
уже наполненного канона brewOnly→0). beerkontora (by-collection InSales) остаётся отдельным
`ingest-shop.ts` — иная стратегия (коллекция=пивоварня), не плоский каталог.

**Завершено (2026-06-01):** полный регресс DRY пройден, тоталы сверены с живой БД —
kraftbeer 295=295, pivokom 1770=1770, vashchehov 148=148 (точно); storebeer 1941 vs 1947
(±6: NONBEER шире + дрейф); rusbeershop 8797 = первый скан (раньше не сканировался). 5
bespoke-скриптов удалены, ссылки в доках перенаправлены на движок. typecheck чист.

**Не делалось (отдельно):** адаптер `insales-flat` для craftbeer78/leolsbeer (сейчас
blocked по др. причинам — AJAX-пагинация/нет цен в каталоге); recurring-перескан — TASK-25.
<!-- SECTION:NOTES:END -->
