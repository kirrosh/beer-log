---
id: TASK-27
title: 'Prose-источники: свежесть/повторная экстракция (recurring для prose)'
status: To Do
assignee: []
created_date: '2026-06-02 09:59'
updated_date: '2026-06-04 11:13'
labels:
  - demand
  - frozen
dependencies:
  - TASK-25
  - TASK-26
references:
  - data/ingest/prose-flow.md
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Платформа prose (бар/блог → LLM-кандидаты → matcher, см. data/ingest/prose-flow.md) даёт листинги, но НЕ имеет recurring-петли как магазины (TASK-25): источник не парсится движком напрямую, экстракция — ручной заход LLM-субагента. Проза кумулятивна и быстро устаревает (Шустрый Шмель: последний пост ~26.04, скан 02.06). Нужен глагол refresh для prose: периодически перезапускать экстракцию поверх того же prose-файла и переингестить, чтобы метка доступности не протухала. Первые источники: 4tozabar-nn (Шмель, micropubru.orgs.biz), кандидат — hophead-nn (@hopheadnn).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pipeline-status видит prose-магазины со stale proseFile (по extractedAt в JSON старше порога) и ставит их в очередь refresh-prose
- [ ] #2 Документирован/автоматизирован повторный заход субагента-экстрактора поверх существующего prose-<shop>.json + переингест (idPrefiX-slug-date обновляет дату листинга)
- [ ] #3 Свежесть prose-листингов отражается на витрине так же, как у магазинов (флаг stale)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Аналог TASK-25, но для prose: там recurring через единый движок (магазин парсится сам), здесь — петля над LLM-экстракцией. Дёшево не сделать (каждый refresh = заход субагента), поэтому low и больший порог свежести, чем у магазинов.

ЗАМОРОЖЕНО 2026-06-04 (рамка пет-проекта, memory pet-project-personal-utility-frame): авто-надёжность/слепая ширина каталога нужны масштабируемому продукту, не личному инструменту. Рост каталога теперь demand-driven (трек E TASK-37..40 + TASK-28) — приносит нужные пивоварни там, где Кирилл пьёт. Разморозить, когда реально мешает личному юзу.
<!-- SECTION:NOTES:END -->
