---
id: TASK-17
title: 'fetch-channels: глубокий back-scan для never-ingested каналов'
status: To Do
assignee: []
created_date: '2026-05-31 14:41'
labels:
  - ingest
milestone: 'M1: Ширина каталога + витрина'
dependencies:
  - TASK-13
references:
  - scripts/fetch-channels.ts
  - data/ingest/RUNBOOK.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
fetch-channels.ts теперь для каналов без единого извлечённого сорта (neverIngested) игнорирует newestId и делает back-scan — но цикл по-прежнему ограничен 2 страницами (ветка !since: 'if (!since && pages >= 2) break'). У зашумлённых каналов (еда/события/маркетинг) обзорный пост с ассортиментом может лежать ГЛУБЖЕ 2 страниц, и автоматический путь его не достанет.

Пример (2026-05-31): hmelnoe-podvore — ассортимент (7 сортов) лежал в исторических постах; нашёл его ручным back-read'ом на ~4 страницы (scripts/_peek2 в сессии), автоматический neverIngested-путь с 2-страничным потолком мог бы его пропустить.

Задача: для never-ingested каналов разрешить более глубокий back-scan (напр. до MAX_PAGES=8 вместо 2, либо отдельный флаг DEEP=1 / параметр глубины), с предохранителем. Не трогать обычный инкремент (он дёшев и корректен) и FULL-режим обновлений.

Связано: фикс neverIngested-back-scan и сид из links уже сделаны (коммиты 6b61d3a, 919e39e). Это добор глубины.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 never-ingested канал сканируется глубже 2 страниц (до потолка/настраиваемо)
- [ ] #2 Обычный инкремент и FULL-режим не затронуты, предохранитель по страницам есть
- [ ] #3 Проверено на канале с глубоким ассортиментным постом (ассортимент достаётся автоматически)
<!-- AC:END -->
