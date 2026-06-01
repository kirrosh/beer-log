---
id: task-1
title: Найти TG-каналы баров/магазинов для слоя доступности
status: To Do
assignee: []
created_date: '2026-05-29'
updated_date: '2026-06-01 12:54'
labels:
  - demand
  - phase-0
  - parser
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
