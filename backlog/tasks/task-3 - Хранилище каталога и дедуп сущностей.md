---
id: task-3
title: Хранилище каталога + дедупликация пивоварен и сортов
status: To Do
assignee: []
labels: [catalog, phase-0]
dependencies: [task-2]
created_date: 2026-05-29
---

## Description

Модели есть (`catalog-core`), нужно персистентное хранилище (SQLite через
bun:sqlite) и логика дедупа: одно и то же пиво/пивоварня из разных источников
сливаются по slug+алиасам. См. vault/product/data-model.md.

## Acceptance Criteria

- [ ] Схема SQLite + миграции
- [ ] upsert пивоварен/сортов/листингов с дедупом по slug
- [ ] Очередь на ручную валидацию (status=auto -> validated)
