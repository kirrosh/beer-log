---
id: TASK-24
title: 'Brewery-ресёрчер: refresh/liveness — переобход устаревающих источников'
status: To Do
assignee: []
created_date: '2026-06-01 17:40'
labels:
  - pipeline
  - catalog
milestone: 'M3: Глубина и надёжность каталога'
dependencies:
  - task-22
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Пробел глагола `refresh/liveness` у brewery-ресёрчера ([[entity-researchers]], TASK-22 #4):
источники пивоварни устаревают (канал переехал/умер, сайт сменил движок, Untappd-URL
протух), а переобхода нет — стадия `sourced` один раз выставлена и не пересматривается.

Цель — цикл проверки живости источников: периодически валидировать
`breweries.links`/`ingest-hints`, помечать протухшие, ставить в очередь на ре-ресёрч.
Делает метку «подтверждён пивоварней» (TASK-21) не только точной в моменте, но и
поддерживаемой во времени.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Liveness-проверка источников пивоварни (HTTP-статус/редирект/JS-трап/пустой каталог) — батчем, дёшево (haiku-тир fetch+grep)
- [ ] #2 Протухшие источники помечаются (в `ingest-hints`/`overrides`), пивоварня попадает в очередь `pipeline-status` на повторный `brewery-research`
- [ ] #3 Конвенция «давности» источника (когда считать устаревшим) описана в манифесте brewery-ресёрчера

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Опирается на существующий `brewery-research` (ре-ресёрч) и `pipeline-status` (очередь).
Новое — только liveness-проба + поле давности. Не путать с самовосстановлением ПАРСЕРА
(TASK-5) — здесь про живость ИСТОЧНИКА, не про разметку.
<!-- SECTION:NOTES:END -->
