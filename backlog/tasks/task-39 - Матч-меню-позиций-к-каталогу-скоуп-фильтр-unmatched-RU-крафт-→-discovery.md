---
id: TASK-39
title: Матч меню-позиций к каталогу + скоуп-фильтр; unmatched RU-крафт → discovery
status: To Do
assignee: []
created_date: '2026-06-04 10:37'
labels:
  - data
  - demand
  - untappd
  - matcher
milestone: 'M4: Поиск на точке'
dependencies:
  - TASK-38
references:
  - packages/catalog-core
  - vault/strategy/m4-craft-locator.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Трек E. Свести позиции venue-меню к каталогу.

Матч пивоварни: точный по Untappd-ID (из E2/TASK-38) + fuzzy по имени/алиасам как фолбэк (catalog-matcher). Скоуп-классификатор: пиво (вкл. Б/А) vs вне-канона (сидр/мид/импорт). Разведзонд показал: из 386 «новых» сущностей — смесь импорта (Belgian: 3 Fonteinen, Alvinne, Van Steenberge), сидра/мида (Ashram, Toksovo, Степь и Ветер) — вне канона, И реального RU-крафта вне наших 247 (Midnight Project, Plague, Осьминогец, Заповедник, Gravity — проверено: 0 в каталоге). Зондовый флор match-rate 24% занижен (fuzzy + смесь скоупа) — нужен честный по точному ключу.

Маршрутизация: matched → готовое ребро доступности (E4). Unmatched RU-крафт-пивоварня → очередь brewery-research. Unmatched сорт известной пивоварни → promote-sorts. Импорт/сидр/мид → листинг вне канона (как импорт сейчас).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Матч пивоварни: untappd-ID точный + fuzzy фолбэк; честная метрика match-rate (не зондовый флор)
- [ ] #2 Скоуп-классификатор пиво vs сидр/мид/импорт (по стилю/категории Untappd)
- [ ] #3 Unmatched RU-крафт → очередь brewery-research/promote-sorts (demand-driven discovery предложения, ср. TASK-28)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Это замыкает петлю: demand-сторона (что бары реально льют/продают) вскрывает дыры supply-стороны. Зонд: Midnight Project, Plague Brew, Осьминогец, Заповедник, Gravity Project, Godbeerg — заметный RU-крафт, которого нет в 247. Потенциал кратного расширения каталога.
<!-- SECTION:NOTES:END -->
