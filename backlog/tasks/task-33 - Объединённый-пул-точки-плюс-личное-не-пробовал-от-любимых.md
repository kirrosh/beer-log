---
id: TASK-33
title: 'Объединённый пул точки + личное: «не пробовал»/«от любимых»/замена'
status: To Do
assignee: []
created_date: '2026-06-04 12:00'
milestone: 'M4: Поиск на точке'
labels:
  - search
  - personal
  - venue
dependencies:
  - TASK-30
  - TASK-31
references:
  - data/personal/tastings.json
  - data/personal/highlights.json
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Подзадача B4. Поверх объединённого пула точки (кран draft + холодильник can/bottle) — персональные
срезы: «что я тут ещё НЕ пробовал» (×tastings), «от твоих любимых пивоварен тут есть…» (favorite),
«топ точки» (highlights), «замена той, что не нашёл» (тот же бренд/стиль — реальный кейс B3/B5).
Это слой ответов, который собирает M4 в полезный инструмент у полки.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Запрос пула точки: distinct сорта по seller (draft+can/bottle), с linkage к beers/tastings/highlights
- [ ] #2 Срезы: not-tasted (анти-повтор), from-favorites (любимые пивоварни), highlights, substitution (бренд→стиль→профиль)
- [ ] #3 Прогон на Beer Mug Гагарина (после оцифровки холодильника): все срезы дают осмысленный ответ
<!-- AC:END -->

## Implementation Notes
<!-- SECTION:NOTES:BEGIN -->
Личный слой готов (data/personal/, TASK-29-related). Substitution работает и БЕЗ оцифровки холодильника (на кране) — дешёвая победа, можно сделать раньше. favorite-пивоварни — из tastings.favorite или частых verdict=fire.
<!-- SECTION:NOTES:END -->
