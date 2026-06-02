---
id: TASK-24
title: 'Brewery-ресёрчер: refresh/liveness — переобход устаревающих источников'
status: Done
assignee: []
created_date: '2026-06-01 17:40'
labels:
  - pipeline
  - catalog
milestone: 'M3: Глубина и надёжность каталога'
dependencies:
  - task-22
priority: medium
updated_date: '2026-06-02'
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
- [x] #1 Liveness-проверка источников пивоварни (HTTP-статус/редирект/JS-трап/пустой каталог) — батчем, дёшево (haiku-тир fetch+grep) → `scripts/check-liveness.ts` (чистый HTTP, без агента: untappd 404/empty, telegram dead/empty/private, website/vk статус)
- [x] #2 Протухшие источники помечаются (`ingest-hints[slug].liveness`), пивоварня попадает в очередь `pipeline-status` на повторный `brewery-research` (ветка `deadIngestable`: все ingestable-источники непригодны)
- [x] #3 Конвенция «давности» источника описана в манифесте brewery-ресёрчера ([[entity-researchers]]) + пороги `FRESH` в `pipeline-status.ts` (TG 3д / Untappd 14д / liveness — периодич.)

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Опирается на существующий `brewery-research` (ре-ресёрч) и `pipeline-status` (очередь).
Новое — только liveness-проба + поле давности. Не путать с самовосстановлением ПАРСЕРА
(TASK-5) — здесь про живость ИСТОЧНИКА, не про разметку.

**Реализовано (2026-06-02):** глагол `refresh` шире liveness — это ещё и content-refresh по
давности (новые `pipeline-status` action'ы `refresh-tg`/`refresh-untappd`, низший приоритет
плана, после первичной заливки). Анти-оверкилл: TG инкрементален (`fetch-channels` по
`newestId`), Untappd — page-1 (`UNTAPPD_NO_PAGINATE=1`), сортировка по давности + cap-N.
refresh стоит ПЕРЕД `demand` в цепочке nextAction: свежесть каталога ортогональна продаже.
Liveness (`check-liveness.ts`) — периодический шаг, не каждый виток (см. pipeline-run SKILL).
<!-- SECTION:NOTES:END -->
