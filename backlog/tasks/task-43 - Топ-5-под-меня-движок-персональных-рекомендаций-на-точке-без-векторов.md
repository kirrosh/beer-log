---
id: TASK-43
title: 'Топ-5 под меня: движок персональных рекомендаций на точке (без векторов)'
status: Done
assignee: []
created_date: '2026-06-04 17:31'
updated_date: '2026-06-07 08:41'
labels:
  - personal
  - recommendations
  - ux
milestone: 'M4: Поиск на точке'
dependencies:
  - TASK-33
  - TASK-36
references:
  - data/personal/tastings.json
  - scripts/lib/venue-personal.ts
  - data/personal/highlights.json
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
На точке (или в гео-радиусе) сразу дать топ-5 кандидатов под меня = микс «повторить любимое» + «новое по профилю вкуса». Кирилл: «дать топ-5 вариантов исходя из того что понравилось, что не пробовал, и что пробовал — можно повторить».

Делается БЕЗ sqlite-vec (TASK-36) на простых сигналах из tastings.json — даёт ~80% пользы векторных рек дёшево. Векторная «похожесть» — апгрейд позже, этот таск ею не блокируется.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Профиль вкуса из tastings.json: `bot-recommend.ts` строит fireStyles/goodStyles (по
      style.category из beerId) + favoriteBreweries (favorite|fire). Веса wouldRepeat учтены в ветке repeat.
- [x] #2 Скоринг кандидатов в пуле точки: ветка `repeat` (fire/wouldRepeat, есть сейчас, score 1.0) +
      ветка `new` (совпадение стиля 0.6/0.4 + любимая пивоварня 0.4 + highlight + свежесть) → смешанный
      топ (до 2 repeat + остальное new, добор до limit). `scripts/bot-recommend.ts`.
- [~] #3 Выдача в боте: команда `beerlog recommend|top5 --seller <seller>` → JSON с
      `recommendations[]` (branch 🔁repeat/✨new/discover, score, reasons[], image/abv/style/price/format).
      Интент #3 в `beer-concierge/SKILL.md` переписан (синтез карточек + обложки). **Inline-кнопки
      «Беру»/«Открыть» НЕ сделаны** — требуют сырой Bot API (не в allowlist бота), осознанно опущены;
      «беру» закрывается интентом #5 (дегустация). Живой smoke в боте — за оператором.
- [x] #4 Graceful degradation: `fallbackMode` при <2 дегустаций или отсутствии сигнала → ветка
      `discover` (highlights впереди, дальше наличие/цена). Проверено на текущих 4 дегустациях.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Данные уже есть: tastings (verdict/favorite/wouldRepeat/descriptors/brewerySlug/style), каталог со style.category/abv. Переиспользует срезы venue-personal.ts (TASK-33: «от любимых»/«не пробовал»), добавляя скоринг и смешивание. TASK-36 (векторы) — апгрейд похожести позже, НЕ зависимость на исполнение. Узкое место — объём tastings (сейчас 4 записи): ценность растёт с вводом дегустаций → связано с быстрым вводом tasting (сценарий D1 эпика TASK-29).

**Реализация (2026-06-05):** `scripts/bot-recommend.ts` + `beerlog recommend|top5` (+ allowlist
`bot-permit.ts`). Скоринг лексический/категориальный (без векторов — TASK-36 апгрейд позже).
Smoke на `beermug-nn/gagarina-118`: 2 repeat (огоньки) + Selfmade BFG (highlight must-try) +
Gletcher Helles (любимая пивоварня) + свежак — осмысленно. Замечание: `style_category`/`abv` у
части сортов в каталоге пусты → часть new-сигналов идёт по highlight/пивоварне/свежести, не по стилю;
выправляется наполнением каталога, не кодом. Остаток — inline-кнопки (нужен сырой Bot API) и живой
smoke в боте.
<!-- SECTION:NOTES:END -->
