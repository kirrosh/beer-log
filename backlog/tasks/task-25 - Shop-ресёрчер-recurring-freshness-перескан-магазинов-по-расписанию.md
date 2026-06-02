---
id: TASK-25
title: 'Shop-ресёрчер: recurring/freshness — перескан магазинов по расписанию'
status: Done
assignee: []
created_date: '2026-06-01 17:40'
updated_date: '2026-06-02'
labels:
  - pipeline
  - demand
milestone: 'M3: Глубина и надёжность каталога'
dependencies:
  - task-22
  - task-23
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Пробел глагола `recurring/freshness` у shop-ресёрчера ([[entity-researchers]], TASK-22 #4):
магазин сканируется разово (`scanned`), стадии `recurring` по факту нет — цены/наличие
устаревают, истории нет. «Где найти» (TASK-20) подаётся как best-effort именно поэтому.

Цель — перескан по расписанию: магазины со `status=scanned` периодически пересканируются
(глагол `ingest` поверх единого движка TASK-23), накапливая историю цен/наличия для
детекта скидок (TASK-9) и свежести метки доступности.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Стадия `recurring` в `pipeline-status` (магазин с `ingestConfig` и `lastScan` старше 7д или null → group `rescan-shop` в `--plan` + секция «ПЕРЕСКАН НУЖЕН» в дашборде)
- [x] #2 Перескан через единый shop-ingest (TASK-23) `ingest-shop-platform.ts <id>`; история цен не затирается — `recordListing`/`price_snapshots` копит снапшоты (repo.ts), `discounted` считается от прошлого; `lastScan` пишется автоматически после реального скана (`r.listings>0`, не DRY)
- [x] #3 Свежесть на витрине: `export-catalog.ts` добавляет флаг `stale` (>14д) на каждый `places[]` в «Где найти» (дата `seenAt` уже была)

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Зависит от единого движка (TASK-23) — иначе перескан тащит bespoke-скрипты. История цен —
уже есть инфраструктура снапшотов (TASK-9/10). Расписание — через control-plane
(`pipeline-status` ставит в очередь по давности `lastScan`), фактический запуск —
`pipeline-run`/cron позже.
<!-- SECTION:NOTES:END -->
