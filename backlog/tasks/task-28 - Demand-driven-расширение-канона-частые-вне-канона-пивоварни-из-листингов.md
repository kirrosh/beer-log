---
id: TASK-28
title: 'Demand-driven расширение канона: частые вне-канона пивоварни из листингов'
status: Done
assignee: []
created_date: '2026-06-02 09:59'
updated_date: '2026-06-02 14:09'
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
- [x] #2 Топ-9 заведены: brewery-research (5 субагентов sonnet) → upsertBrewery → ingest-untappd. White Stone, Magic Mess, Big Pot, BAD Brew, Tarkos, Atmosphere, Red Rocket, Mantra, Dieta — +1594 untappd-сорта. Связка #1→research→ingest проверена в бою; хвост кандидатов (Two Peaks, Brudazz, Midnight, Double Tree, Ability, Gorkovskaya, Paranoia, KarKas, Ostrovica) — повторными прогонами `demand:candidates` (recurring, как breadth-backfill)
- [x] #3 Импорт/мейнстрим и не-пиво отсекаются: в скрипте (словарь + лексика de/weisse/kloster/brouwerij; тип-префикс сидр/комбуча/зельцер + напитки) и при заводе субагентом (Lapochka отсеяна как лимонады Ostrovica, не пивоварня; Bad Balance отделён от BAD Brew). В канон — только верифицированный росс. крафт
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
**Завод выполнен (2026-06-02) — #2:** дешёвый срез alias-fix (Red Button/Chibis/Black Cat —
были в каноне, добавлены короткие алиасы + rematch, −370 unmatched). Затем топ-9 новых заведены:
brewery-research субагентами → 9 пивоварен (247 всего) с untappd/TG/VK/сайт → ingest-untappd 1594
сорта (провенанс «подтверждён»). rematch привязал ~360 магазинных листингов к новому канону;
unmatched 5233→4500. Каталог 238→247 пивоварен, +1666 сортов, +2 города. Все AC закрыты → Done.
Хвост demand-кандидатов добирается повторным `bun run demand:candidates`.
<!-- SECTION:NOTES:END -->
