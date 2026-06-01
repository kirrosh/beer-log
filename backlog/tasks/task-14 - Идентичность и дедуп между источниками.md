---
id: task-14
title: Идентичность и дедуп между источниками
status: Done
assignee: []
created_date: '2026-05-29'
updated_date: '2026-06-01 12:53'
labels:
  - catalog
  - infra
dependencies:
  - task-12
  - task-13
  - task-10
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Слить одну пивоварню/сорт из реестра + TG/VK + магазинов в одну сущность: алиасы,
транслитерация, fuzzy-сопоставление («Afbrew» ≈ «AF Brew», «Виктори Арт» ≈
«Victory Art Brew»). Базовый дедуп по slug уже есть в store (task-8); нужен
межисточниковый. См. vault/product/data-model.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Fuzzy-матчинг имён (нормализация + расстояние) с порогом
- [x] #2 Очередь спорных слияний на ручную валидацию
- [x] #3 Кросс-источниковые алиасы сохраняются
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Реализовано как scripts/lib/catalog-matcher.ts (нормализация транслита + isSameBeer, скан алиаса по границе слова) + очередь спорных слияний = гейт human-review (needsReview/promote-sorts). Кросс-источниковые алиасы копятся на сущностях. Все ингесты магазинов матчат через него.
<!-- SECTION:FINAL_SUMMARY:END -->
