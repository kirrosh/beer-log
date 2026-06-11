---
id: TASK-60
title: 'Шаг «флагман» в скилле brewery-research: фиксация визитки в canon.json'
status: To Do
assignee: []
created_date: '2026-06-11 09:50'
labels:
  - canon
  - pipeline
milestone: 'M5: Рекомендации, метрики выбора и канон'
dependencies:
  - TASK-52
references:
  - .claude/skills/brewery-research/SKILL.md
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Инкремент скилла brewery-research: он уже ходит по источникам каждой пивоварни — добавить шаг «зафиксируй визитку» (1–3 канонических сорта, по которым пивоварню знают) в canon.json с basis=research почти бесплатно. Так канон-слой наполняется непрерывно вместе с конвейером, а не только разовым ресёрчем TASK-53. Описание майлстоуна: backlog/docs/doc-1.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 SKILL.md brewery-research дополнен шагом: определить 1–3 флагмана пивоварни (по чекинам/известности из посещаемых источников) и записать в canon.json с basis=research и обоснованием
- [ ] #2 Дедуп: существующая запись flagship этой пивоварни (distribution/checkins-черновик) обновляется, не дублируется; research-basis приоритетнее черновика
- [ ] #3 Прогон на 2–3 пивоварнях из очереди подтверждает: записи корректны, конвейер не замедлился заметно
<!-- AC:END -->
