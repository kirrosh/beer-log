---
id: TASK-30
title: 'Каскад «найти ту самую»: fuzzy-поиск по неточному имени'
status: To Do
assignee: []
created_date: '2026-06-04 12:00'
milestone: 'M4: Поиск на точке'
labels:
  - search
  - venue
dependencies:
  - TASK-29
references:
  - scripts/lib/catalog-matcher.ts
  - vault/strategy/m4-craft-locator.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Подзадача B1 (выбрана первой). «Есть ли сорт X на точке» по НЕточному имени (с банки/из головы):
лексический fuzzy, НЕ вектора. Поверх существующего `catalog-matcher` (алиасы + транслит-нормализация
+ токен-раны, уже 30-65% на магазинах) добавить триграммный/Левенштейн fuzzy (SQLite FTS5 + spellfix1
— встроенно, без отдельной БД). Каскад деградации «лучше грубо, чем никак»:
точный сорт → fuzzy по алиасам → только пивоварня узнана → «вот похожее у этого бренда».
Горячий путь, in-memory/SQLite, без LLM. Область поиска — объединённый пул точки (draft+can/bottle).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 FTS5 + spellfix1 индекс по сортам/пивоварням каталога (имя+алиасы); подключение расширения в bun:sqlite
- [ ] #2 Функция поиска с каскадом: точный→fuzzy→brewery-only→fallback, scoped по seller точки; возвращает ранжированные кандидаты + уровень уверенности
- [ ] #3 Прогон на текущих данных Beer Mug (кран): «есть ли Jaws Атомная», «эрик» (опечатка), «бфг» — корректная деградация. Метрика: доля запросов с непустым полезным ответом
<!-- AC:END -->

## Implementation Notes
<!-- SECTION:NOTES:BEGIN -->
Фундамент есть — `catalog-matcher` не с нуля, а расширяем. spellfix1 даёт edit-distance; FTS5 — токен/префикс. Деградация повторяет brewery-only fallback матчера. Не тащить вектора — это TASK-36.
<!-- SECTION:NOTES:END -->
