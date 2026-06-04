---
id: TASK-43
title: 'Топ-5 под меня: движок персональных рекомендаций на точке (без векторов)'
status: To Do
assignee: []
created_date: '2026-06-04 17:31'
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
- [ ] #1 Профиль вкуса из tastings.json: частоты style.category и descriptors по verdict in (fire,good); веса favorite/wouldRepeat
- [ ] #2 Скоринг кандидатов в пуле точки: ветка «повторить» (был fire/good + wouldRepeat, есть сейчас) и ветка «новое» (совпадение стиля/тегов профиля, не пробовал) → смешанный топ-5 (напр. 2 повторить + 3 новых)
- [ ] #3 ОСНОВНАЯ выдача — в боте, МАКСИМАЛЬНО богатая: команда /top5 (или текстовый запрос) → 5 карточек с ОБЛОЖКАМИ сортов (sendPhoto, или sendMediaGroup-альбом; imageUrl из TASK-15), caption в HTML: пивоварня·сорт·стиль·ABV + эмодзи-бейдж ветки (🔁 повторить / ✨ новое под тебя) + «почему» (совпало по стилю/тегу/любимой пивоварне); под каждой inline-кнопки «Беру», «Открыть сорт». Контекст точки = из диалога/последней гео или вопрос «ты где?». Мини-апп (TASK-34) — опц. витрина того же
- [ ] #4 Graceful degradation при малом числе дегустаций: фолбэк на highlights (must-try/value) и любимые пивоварни (brewerySlug)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Данные уже есть: tastings (verdict/favorite/wouldRepeat/descriptors/brewerySlug/style), каталог со style.category/abv. Переиспользует срезы venue-personal.ts (TASK-33: «от любимых»/«не пробовал»), добавляя скоринг и смешивание. TASK-36 (векторы) — апгрейд похожести позже, НЕ зависимость на исполнение. Узкое место — объём tastings (сейчас 4 записи): ценность растёт с вводом дегустаций → связано с быстрым вводом tasting (сценарий D1 эпика TASK-29).
<!-- SECTION:NOTES:END -->
