---
id: TASK-52
title: >-
  Канон-слой: data/personal/canon.json + черновые визитки пивоварен по
  дистрибуции
status: Done
assignee: []
created_date: '2026-06-11 09:48'
updated_date: '2026-06-11 10:14'
labels:
  - personal
  - canon
milestone: 'M5: Рекомендации, метрики выбора и канон'
dependencies:
  - TASK-51
references:
  - data/personal/highlights.json
  - data/personal/tastings.json
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Глобальный слой «что маст-трай» — ось «канонично», отличная от «под мой вкус» и от highlights.json (тот привязан к точке и станет производной от канона). Три типа: brewery-flagship (визитка пивоварни), style-benchmark (эталон стиля в РФ), ru-classic (знаковые сорта рос. крафта). Наполнение честное — известность как факт, не оценка: дистрибуция (этот таск), чекины Untappd (TASK-59), ресёрч (TASK-53). Этот таск — схема файла + детерминированный черновик визиток по дистрибуции. Описание майлстоуна: backlog/docs/doc-1.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Схема data/personal/canon.json в _schema: beerId, beer, canonType (brewery-flagship | style-benchmark | ru-classic), basis (distribution | checkins | research + обоснование одной фразой), note, addedAt
- [x] #2 Скрипт canon-draft: для каждой пивоварни с breadth-сигналом топ-сорт по числу продавцов → черновая запись brewery-flagship с basis=distribution (порог отсечки задокументирован)
- [x] #3 Дедуп: повторный прогон скрипта не плодит дубли, ручные/research-записи не перетираются
- [x] #4 README данных (data/personal/README.md) обновлён: связь canon.json ↔ highlights.json (точка наполняется из канона)
<!-- AC:END -->
