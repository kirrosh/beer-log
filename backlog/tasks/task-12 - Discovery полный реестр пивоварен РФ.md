---
id: task-12
title: Discovery — полный реестр пивоварен РФ + офиц. ссылки
status: To Do
assignee: []
created_date: '2026-05-29'
updated_date: '2026-05-29 16:43'
labels:
  - discovery
  - phase-0
  - next
milestone: 'M1: Ширина каталога + витрина'
dependencies: []
priority: high
---

## Description

Слой 1 (см. vault/product/sourcing-strategy.md). Приоритет Фазы 0 — полнота
справочника. Собрать максимально полный список пивоварен РФ + их официальные
ссылки (сайт/VK/TG), не полагаясь ни на один источник. Источники: полный обход
russiancraftbeer (пагинация /list, /gorod/*, страницы /brewery со ссылками и
сортами), брендовые списки магазинов (craftopt, craftbeer78, beerkontora),
profibeer. Реестр — только для обнаружения (кто есть + где офиц. канал), не как
источник правды (данные устаревшие, 2017).

## Acceptance Criteria

- [ ] Полный обход russiancraftbeer (пагинация /list + города + /brewery)
- [ ] Импорт брендовых списков из 2-3 магазинов
- [ ] >= 200 пивоварен с городом и хотя бы одной офиц. ссылкой
- [ ] Дедуп с существующими записями (slug/алиасы)
