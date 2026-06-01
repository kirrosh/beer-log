---
id: task-2
title: Довести Telegram-парсер до боевого состояния
status: To Do
assignee: []
created_date: '2026-05-29'
updated_date: '2026-06-01 12:57'
labels:
  - parser
  - phase-0
milestone: 'M3: Глубина и надёжность каталога'
dependencies:
  - task-1
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Прототип `telegram-web` парсит t.me/s/<channel> регэкспами. Нужно: пагинация
(параметр before=), дедуп сообщений, сохранение сырых снапшотов HTML для
переразбора, нормальный HTML-парсер вместо regex (node-html-parser).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

- [ ] Пагинация по истории канала
- [ ] Сырые снапшоты сохраняются в data/raw-snapshots/
- [ ] Точность извлечения названия/стиля/цены измерена на 100 сообщениях
- [ ] healthCheck интегрирован в запуск

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Понижено: ядро уже работает — fetch-channels.ts делает пагинацию (before=) + дедуп, t.me/s+regex извлекает достаточно. Остаток (raw-снапшоты в data/raw-snapshots/, node-html-parser вместо regex, healthCheck в рантайме) — инфра-полировка, пока не было сбоев. Делать при первом дрейфе разметки TG.
<!-- SECTION:NOTES:END -->
