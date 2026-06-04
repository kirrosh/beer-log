---
id: TASK-36
title: 'Векторные «похожие»/рекомендации (sqlite-vec) — опц./позже'
status: To Do
assignee: []
created_date: '2026-06-04 12:00'
milestone: 'M4: Поиск на точке'
labels:
  - search
  - later
dependencies:
  - TASK-30
references:
  - vault/strategy/m4-craft-locator.md
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Подзадача B3 — ВНЕ MVP (решение 2026-06-04: эмбеддинги пока не считаем). Для «похожее на X» и
рекомендаций — векторная близость по (style + descriptors + abv + профиль). НЕ отдельный сервис:
`sqlite-vec` встраивается в bun:sqlite. Эмбеддинги считаются в фоне (предрасчёт), в моменте — kNN.
Включать, когда наберётся профиль вкусов (tastings) и потребность в «похожем» станет реальной.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 sqlite-vec подключён к bun:sqlite; таблица эмбеддингов сортов (фоновый предрасчёт)
- [ ] #2 kNN «похожие на сорт X» / «похожее в наличии на точке»; интеграция в каскад как последняя ступень деградации
- [ ] #3 Оценка пользы vs стоимость на реальном профиле — решение, оставлять ли в продукте
<!-- AC:END -->

## Implementation Notes
<!-- SECTION:NOTES:BEGIN -->
Отложено намеренно. Лексика (TASK-30) закрывает «найти ту самую»; вектора — только семантическое «похожее». Эмбеддинг-источник: style/category/abv + descriptors из tastings. Дешёвая локальная модель эмбеддингов или batch-API.
<!-- SECTION:NOTES:END -->
