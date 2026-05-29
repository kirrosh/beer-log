---
id: task-14
title: Идентичность и дедуп между источниками
status: To Do
assignee: []
labels: [catalog, infra]
dependencies: [task-12, task-13, task-10]
created_date: 2026-05-29
---

## Description

Слить одну пивоварню/сорт из реестра + TG/VK + магазинов в одну сущность: алиасы,
транслитерация, fuzzy-сопоставление («Afbrew» ≈ «AF Brew», «Виктори Арт» ≈
«Victory Art Brew»). Базовый дедуп по slug уже есть в store (task-8); нужен
межисточниковый. См. vault/product/data-model.md.

## Acceptance Criteria

- [ ] Fuzzy-матчинг имён (нормализация + расстояние) с порогом
- [ ] Очередь спорных слияний на ручную валидацию
- [ ] Кросс-источниковые алиасы сохраняются
