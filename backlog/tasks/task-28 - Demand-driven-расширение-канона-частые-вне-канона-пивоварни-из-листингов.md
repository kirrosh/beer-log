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
- [x] #1 Скрипт `scripts/unmatched-brands.ts` (`bun run demand:candidates`) агрегирует unmatched price_listings по кандидат-бренду с частотой + охватом магазинов; прогон через `buildMatcher` отсекает канон-промахи (пивоварня есть, сорт нет → rematch, 230 шт)
- [ ] #2 Топ часто-встречающихся вне-канона РФ-пивоварен заводятся в реестр пивоварен (discovery) и проходят brewery-research → ingest по breadth-backfill
- [~] #3 Импорт/мейнстрим и не-пиво отсекаются в выводе скрипта (словарь брендов + лексика de/weisse/kloster/brouwerij/staatsbrauerei; тип-префикс сидр/комбуча/зельцер + напитки coffee/milkis) — основа готова; финальная верификация росс-крафт vs импорт — при заводе #2
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Пересекается с breadth-backfill (memory), но driver здесь — demand-сигнал (частота в листингах), а не ручной список. Многоканальность (TASK-26): чем в большем числе магазинов встречается бренд, тем выше приоритет завода. Дедуп имён — fuzzy (catalog-matcher, TASK-14).
**Сделано (2026-06-02) — #1 + основа #3:** `scripts/unmatched-brands.ts`. Из 5233 unmatched
листингов: 230 канон-промахов (отсеяны matcher'ом → очередь rematch/alias-fix), ~1027 вне-канона
бренд-ключей. Дедуп бренда по первому токену (общие слова Red/Black/White/Big… → 2 токена, чтобы
Red Button ≠ Red Rocket). Топ demand-кандидатов (≥2 магазинов): Red Button 90, Chibis 80,
White Stone 47, Magic Mess 47, Big Pot 43, BAD Brewery 39, Tarkos 37, Atmosphere 37, Red Rocket 36,
Lapochka 34, Mantra 33, Ostrovica 23, Dieta 17, Two Peaks 17, Brudazz 17, Midnight Project 13,
Double Tree 10, Gorkovskaya 8, Paranoia 6, KarKas 5, Ability 3 — ровно бренды из описания + новые.
**Осталось #2:** завести топ в реестр пивоварен → brewery-research → breadth-backfill (Untappd-сорта).
Хвост шума (lotte/vinut напитки, hara/zubr/schofferhofer импорт) виден глазами при заводе.
<!-- SECTION:NOTES:END -->
