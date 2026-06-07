---
id: TASK-33
title: 'Объединённый пул точки + личное: «не пробовал»/«от любимых»/замена'
status: Done
assignee: []
created_date: '2026-06-04 12:00'
updated_date: '2026-06-07 08:50'
labels:
  - search
  - personal
  - venue
milestone: 'M4: Поиск на точке'
dependencies:
  - TASK-30
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
- [x] #1 Запрос пула точки: `buildPool` (экспортирован из venue-search.ts) — distinct сорта по seller (draft+can/bottle), дедуп по канон-сорту, linkage к beers (стиль/цена/провенанс)
- [x] #2 Срезы: not-tasted (анти-повтор по tastings), from-favorites (пивоварни из favorite|fire), highlights (редакторские бейджи×пул), substitution (бренд→стиль→категория; стиль детектится из имени через categorizeStyle, т.к. style_slug в БД пуст). `scripts/lib/venue-personal.ts`
- [x] #3 Прогон на Beer Mug Гагарина (кран, 44 поз.): notTasted 44/44 при пустых tastings и 42/44 с дегустациями, fromFavorites даёт сорта любимого бренда, highlights 3, substitution Jaws→IPA. `bun scripts/venue-personal.ts --demo`. Холодильник расширит пул, когда появятся юзер-фото (TASK-34)
<!-- AC:END -->

## Implementation Notes
<!-- SECTION:NOTES:BEGIN -->
Личный слой готов (data/personal/, TASK-29-related). Substitution работает и БЕЗ оцифровки холодильника (на кране) — дешёвая победа, можно сделать раньше. favorite-пивоварни — из tastings.favorite или частых verdict=fire.

**Реализовано (2026-06-04):** `scripts/lib/venue-personal.ts` (срезы) + CLI `scripts/venue-personal.ts`. `buildPool` вынесен/экспортирован из venue-search.ts (+ поля стиль/цена/провенанс в PoolItem). Срезы корректно деградируют при пустом tastings (notTasted=весь пул, fromFavorites=пусто с подсказкой). Substitution: стиль берётся из БД, а если пусто/unknown — детектится из имени сорта (`categorizeStyle`), т.к. style_slug в beers массово не заполнен.

**tastings пуст** — для полноценных not-tasted/from-favorites пользователю наполнить `data/personal/tastings.json` реальными дегустациями (был в Beer Mug 2026-06-04). Механизм проверен на синтетике (реальный файл не трогали).
<!-- SECTION:NOTES:END -->
