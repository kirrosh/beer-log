---
id: TASK-28
title: 'Demand-driven расширение канона: частые вне-канона пивоварни из листингов'
status: To Do
assignee: []
created_date: '2026-06-02 09:59'
labels:
  - demand
dependencies:
  - TASK-21
references:
  - data/ingest/breadth-backfill.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Каждый скан магазина/бара даёт хвост «не узнано» = РФ-пивоварни вне канона + импорт. По НН за этот заход всплыли: Таркос, Ривертом, СОЛБИРС, Мэджик Мэсс, Хоп Хэд, БЭД Брювери, Островица, Дискавери, Ослиная (fish-business); Plague Brew, Степь и Ветер, Ability, DIETA, Gurin Craft, Меда Сибири, Чаща, Main Rule, Red Rocket, Gusi (Шустрый Шмель). Это прямой сигнал спроса: раз бутлшоп/бар возит — пивоварню стоит завести в канон (breadth-backfill → Untappd-сорта). Нужен системный проход: агрегировать unmatched-листинги по частоте упоминания брендов через все магазины и завести топ в discovery → research → ingest.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Скрипт/запрос агрегирует unmatched price_listings по нормализованному имени бренда с частотой (в скольких магазинах встречается)
- [ ] #2 Топ часто-встречающихся вне-канона РФ-пивоварен заводятся в реестр пивоварен (discovery) и проходят brewery-research → ingest по breadth-backfill
- [ ] #3 Импорт/мейнстрим отсекается (остаётся листингами beer_id=null), в канон — только росс. крафт
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Пересекается с breadth-backfill (memory), но driver здесь — demand-сигнал (частота в листингах), а не ручной список. Многоканальность (TASK-26): чем в большем числе магазинов встречается бренд, тем выше приоритет завода. Дедуп имён — fuzzy (catalog-matcher, TASK-14).
<!-- SECTION:NOTES:END -->
