---
id: TASK-39
title: Матч меню-позиций к каталогу + скоуп-фильтр; unmatched RU-крафт → discovery
status: Done
updated_date: '2026-06-04'
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
- [x] #1 Матч пивоварни: untappd-ID точный + fuzzy фолбэк; честная метрика match-rate (не зондовый флор)
- [x] #2 Скоуп-классификатор пиво vs сидр/мид/импорт (по стилю/категории Untappd)
- [x] #3 Unmatched RU-крафт → очередь brewery-research/promote-sorts (demand-driven discovery предложения, ср. TASK-28)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Это замыкает петлю: demand-сторона (что бары реально льют/продают) вскрывает дыры supply-стороны. Зонд: Midnight Project, Plague Brew, Осьминогец, Заповедник, Gravity Project, Godbeerg — заметный RU-крафт, которого нет в 247. Потенциал кратного расширения каталога.

**Реализация (2026-06-04, внутри ingest-untappd-menu.ts).** Матч пивоварни: (1) точный по untappd-id — карта `/w/<id>` из `breweries.links`; (2) fuzzy-фолбэк `catalog-matcher.match("<пивоварня> <сорт>")`. Сорт внутри известной пивоварни — новый метод `matchInBrewery(breweryId, name)` в catalog-matcher.ts (isSameBeer + auto-create). **Самоулучшение:** сматченным fuzzy пивоварням бэкфиллим untappd-id в `links` → следующие прогоны идут точным ключом (на 3 венью бэкфилл +34 id, было 25 → 59). Скоуп-классификатор: `categorizeStyle(styleRaw).category === "non-beer"` → сидр/мид/комбуча вне канона (на Братьях 58 поз). Unmatched (скоуп=пиво) → `data/discovery/untappd-menu-new-breweries.json` (untappdId, cyrillic-хинт, venues, maxCount, sampleBeers; merge между венью) → вход brewery-research. Честный match-rate пивоварни: Братья 48.8% / Hophead 51.9% / Игра 63.3% (vs зондовый флор 24%). Все цели зонда всплыли в discovery (Midnight ×25, Plague ×8, Осьминогец, Godbeerg, Пять углов). RU-vs-импорт разрешает research (cyrillic-хинт слаб: Midnight/Plague/Godbeerg латиницей — RU, но cyr=false; импорт Tilquin/Cantillon/3 Fonteinen тоже в списке) — это ок по memory resolve-disputes-by-research.

⚠️ **Находка (общий catalog-matcher, не E-код):** fuzzy путает числовые/edition-варианты — «BFG 9000»→«BFG 8000», «S.I.VII (Maker's Mark)»→«(Heaven Hill Edition)». Шарится со shop/shelf-ингестами; листинг (и обложка task-15) садятся на соседний сорт той же пивоварни. Не чинил (риск регрессий в др. ингестах) — кандидат на отдельную задачу про isSameBeer + цифры/баррель-эдишены.
<!-- SECTION:NOTES:END -->
