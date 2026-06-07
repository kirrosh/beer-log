---
id: task-1
title: Найти TG-каналы баров/магазинов для слоя доступности
status: To Do
assignee: []
created_date: '2026-05-29'
updated_date: '2026-06-07 08:50'
labels:
  - demand
  - phase-0
  - parser
  - backfill
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ПЕРЕОСМЫСЛЕНО под M2 (vault/strategy/drift-to-value.md). Изначально: «прайсовые каналы». Теперь: TG-каналы баров и магазинов как источник СЛОЯ ДОСТУПНОСТИ (где сорт есть в наличии/на кранах) — это ров продукта. Разливные бары без веб-каталога публикуют тап-листы в TG (паттерн — платформа telegram единого shop-ingest, parseTelegramTapList; memory draft-bar-tg-taplist). Цель — найти каналы с открытым t.me/s и текстовыми тап-листами/ассортиментом, не фото-меню.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Найдено >= 15 публичных каналов с прайсами/новинками
- [ ] #2 Каждый проверен парсером (beers+listings > 0)
- [ ] #3 Список занесён в `vault/research/telegram-sources.md` и в `sources.ts`
- [ ] #4 Занесены в data/pipeline/shops.json (platform=telegram) и/или vault/research/telegram-sources.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Заход НН 2026-06-02 (shop-discovery + parse). Метод расширен ЗА пределы TG: каналы баров
системно плохо парсятся — VK/Instagram за логином (VK-стена = SPA+анти-бот, cookie логинит,
но контент не отдаёт; см. memory untappd-venue-not-demand-source); Untappd-venue неверифиц.
заведений = только 5 Popular Drinks. Чистый источник по городу = РЕАЛЬНЫЙ каталог магазина
(fish-business: Bitrix, 398 листингов). Для баров без структуры — НОВАЯ платформа `prose`
(LLM-кандидаты → matcher, см. data/ingest/prose-flow.md): Шустрый Шмель → 50 листингов (36%).
Заведено по НН: fish-business-nn (scanned), 4tozabar-nn=Шмель (prose, scanned), vashchehov-nn
(telegram, scanned) + 7 баров discovered с вердиктами. Открытый кандидат на prose: hophead-nn.
Свежесть prose — отдельная задача (recurring для prose). AC #1 (>=15 каналов) пересмотреть:
по факту публичных парсибельных TG-тап-листов мало; цель сместилась на «любой машинный
источник доступности по городу» (каталог / TG / prose).

СУЖЕНО 2026-06-04 (пет-оптика): скоуп = TG-каналы баров/магазинов ГОРОДОВ Кирилла (НН + куда ездит), не broad РФ. Это длинный хвост доступности вне Untappd — релевантно лично. Пересекается с TASK-41 (venue-маркеры тянут свежесть TG-новостей точки).

Архив: поиск TG-каналов = непрерывный discovery/backfill, отслеживается дашбордом pipeline-status (стадии discovered→sourced→ingested), а не дискретной задачей.
<!-- SECTION:NOTES:END -->
