---
id: TASK-59
title: >-
  Untappd-прайор: ut_rating/ut_checkins в beers, стилевая нормализация,
  уточнение канона
status: To Do
assignee: []
created_date: '2026-06-11 09:50'
labels:
  - personal
  - recommendations
  - ingest
milestone: 'M5: Рекомендации, метрики выбора и канон'
dependencies:
  - TASK-52
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Опциональный внешний прайор — НЕ отзывы и НЕ главный сигнал. Числовой рейтинг при большой выборке полезен, если починить: нормализовать внутри стиля (стауты на Untappd системно выше IPA — сырое 3.9 у лагера ценнее 3.9 у пастри-стаута) и взвесить log(checkins). В выдаче никогда не «оценка пива», только «прайор: выше/ниже среднего по стилю». Вес в скоринге малый и отключаемый. Бонус: checkins — самый честный прокси визитки (известность = факт, не мнение) → уточняет distribution-черновики канона (TASK-52). Тянуть тем же ingest-контуром, что и меню (страницы пивоварен/сортов уже посещаются). Описание майлстоуна: backlog/docs/doc-1.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Миграция: колонки ut_rating REAL, ut_checkins INTEGER (+ ut_seen_at) в beers; ingest-скрипты заполняют их при проходе по Untappd-страницам
- [ ] #2 Нормализация: z-score рейтинга внутри style_category, взвешенный log(checkins); сырое значение в выдаче не показывается
- [ ] #3 Вес прайора в bot-recommend малый и отключается конфигом/флагом; reasons формулируют как «выше среднего по стилю», не как балл
- [ ] #4 canon-draft (TASK-52) использует checkins: самый чекиненный сорт пивоварни уточняет/подтверждает её flagship; расхождение с distribution-черновиком — пометка для ревью
<!-- AC:END -->
