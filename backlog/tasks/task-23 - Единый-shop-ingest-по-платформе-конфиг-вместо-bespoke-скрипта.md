---
id: TASK-23
title: >-
  Единый shop-ingest по платформе: новый магазин = конфиг в shops.json, а не
  bespoke-скрипт (proof контракта ресёрчеров)
status: To Do
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
- [ ] #1 Платформенный ingest-движок: один скрипт `ingest-shop` принимает `id` магазина, читает его `platform`+конфиг из `shops.json`, диспетчит на парсер платформы (`@beer-log/parsers`), пишет листинги через общий путь (`recordListing` + matcher)
- [ ] #2 Парсеры по платформе вынесены/обобщены в `@beer-log/parsers` (woocommerce store API, bitrix-каталог+пагинация, custom-json, telegram-тап-лист, insales) — по интерфейсу, не bespoke
- [ ] #3 Конфиг-схема магазина в `shops.json` расширена полями платформы (endpoint/поля/пагинация); существующие 7 магазинов мигрированы на конфиг, bespoke-скрипты удалены или сведены к тонким обёрткам
- [ ] #4 Регресс: повторный скан мигрированных магазинов даёт тот же набор листингов (± свежесть), числа сверены с `shops.json.note`
- [ ] #5 Обновлены `operating-pipeline.md` (таблица скриптов) и манифест shop-ресёрчера в `entity-researchers.md`

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
<!-- SECTION:NOTES:END -->
