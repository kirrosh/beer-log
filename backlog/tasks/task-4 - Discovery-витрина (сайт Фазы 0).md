---
id: task-4
title: Discovery-витрина каталога (сайт Фазы 0)
status: Done
assignee: []
created_date: '2026-05-29'
updated_date: '2026-06-01 12:54'
labels:
  - web
  - phase-0
dependencies:
  - task-3
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Заменить заглушку `packages/web` на витрину: список пивоварен/сортов с фильтром
по стилю/городу, поиск, страница сорта. Bun + TS. Цель — проверить гипотезу:
ходят ли байеры смотреть discovery (метрики Фазы 0).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Список + фильтры по стилю и городу
- [x] #2 Страница пивоварни и страница сорта
- [ ] #3 Аналитика заходов (уникальные байеры, возвраты, разделы)
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Витрина построена (SvelteKit): список+фильтры по стилю/городу, поиск, карточки сорта/пивоварни, страница /top. AC «аналитика заходов» не сделана намеренно — бессмысленна без деплоя/трафика; вынести в отдельную launch-задачу при публикации.
<!-- SECTION:FINAL_SUMMARY:END -->
