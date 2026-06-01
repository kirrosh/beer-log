---
id: task-5
title: Контур самовосстановления парсеров
status: To Do
assignee: []
created_date: '2026-05-29'
updated_date: '2026-06-01 12:54'
labels:
  - parser
  - agent
  - infra
  - deferred
dependencies:
  - task-2
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Когда healthCheck падает — запускать агента со скиллом, который по описанию
парсера и сырому снапшоту пытается починить экстрактор/регэкспы. См.
vault/product/parser-architecture.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

- [ ] Шедулер прогоняет healthCheck по всем источникам
- [ ] При падении создаётся задача и триггерится агент-фиксер
- [ ] Фикс проходит через ревью/тест перед мержем

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Заморожено: инфра самовосстановления парсеров преждевременна при текущем масштабе (~7 источников, сбоев нет). Вернуться, когда парсеров много и они реально ломаются.
<!-- SECTION:NOTES:END -->
