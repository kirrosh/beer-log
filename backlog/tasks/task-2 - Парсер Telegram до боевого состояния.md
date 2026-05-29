---
id: task-2
title: Довести Telegram-парсер до боевого состояния
status: To Do
assignee: []
labels: [parser, phase-0]
dependencies: [task-1]
created_date: 2026-05-29
---

## Description

Прототип `telegram-web` парсит t.me/s/<channel> регэкспами. Нужно: пагинация
(параметр before=), дедуп сообщений, сохранение сырых снапшотов HTML для
переразбора, нормальный HTML-парсер вместо regex (node-html-parser).

## Acceptance Criteria

- [ ] Пагинация по истории канала
- [ ] Сырые снапшоты сохраняются в data/raw-snapshots/
- [ ] Точность извлечения названия/стиля/цены измерена на 100 сообщениях
- [ ] healthCheck интегрирован в запуск
