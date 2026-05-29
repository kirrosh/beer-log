---
id: task-2
title: Довести Telegram-парсер до боевого состояния
status: To Do
assignee: []
created_date: '2026-05-29'
updated_date: '2026-05-29 16:43'
labels:
  - parser
  - phase-0
milestone: 'M1: Ширина каталога + витрина'
dependencies:
  - task-1
priority: medium
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
