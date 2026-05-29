---
id: task-5
title: Контур самовосстановления парсеров
status: To Do
assignee: []
labels: [parser, agent, infra]
dependencies: [task-2]
created_date: 2026-05-29
---

## Description

Когда healthCheck падает — запускать агента со скиллом, который по описанию
парсера и сырому снапшоту пытается починить экстрактор/регэкспы. См.
vault/product/parser-architecture.md.

## Acceptance Criteria

- [ ] Шедулер прогоняет healthCheck по всем источникам
- [ ] При падении создаётся задача и триггерится агент-фиксер
- [ ] Фикс проходит через ревью/тест перед мержем
