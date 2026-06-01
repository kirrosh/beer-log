---
id: task-9
title: История цен и скидки как пассивный сигнал спроса
status: Done
assignee: []
created_date: '2026-05-29'
updated_date: '2026-06-01 12:54'
labels:
  - catalog
  - phase-2
  - parser
dependencies:
  - task-3
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Наблюдение: точки (напр. «Ваш Чехов») часто скидывают цену на позиции —
вероятно, медленные остатки. Если снимать цену по позиции во времени и детектить
снижения, получаем «что НЕ продаётся» без интервью — сырьё для аналитики спроса.
См. vault/product/data-model.md и vault/strategy/approach.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Снимок цены по позиции при каждом парсинге (price snapshots)
- [x] #2 Детект снижения цены: флаг discounted + дельта к предыдущей цене
- [ ] #3 Отчёт «частые/глубокие уценки» по позициям и стилям (прокси медленных продаж)
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Ядро готово в recordListing: price_snapshots по позиции, detect снижения (discounted+prev_price). AC «отчёт частые/глубокие уценки» — это B2B-аналитика спроса, относится к task-8 (фаза 2), не делаем сейчас.
<!-- SECTION:FINAL_SUMMARY:END -->
