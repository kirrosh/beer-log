---
id: TASK-50
title: 'Value Index: ₽/литр против медианы стиля в скоринге и причинах'
status: To Do
assignee: []
created_date: '2026-06-11 09:47'
labels:
  - personal
  - recommendations
milestone: 'M5: Рекомендации, метрики выбора и канон'
dependencies: []
references:
  - scripts/bot-recommend.ts
  - data/catalog.sqlite
  - >-
    backlog/docs/doc-1 -
    M5-Рекомендации-метрики-выбора-и-канон-—-описание-майлстоуна.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Самая честная метрика выбора из уже имеющихся данных: цена за литр листинга против медианы стиля по всем 28 продавцам. Показывать отклонение в причинах рекомендаций («−18% к медиане стиля» / «переплата +40%») и в интенте #9 «стоит ли брать». Листинги имеют price+volume_ml, сорта — style_category. Описание майлстоуна: backlog/docs/doc-1.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Функция/SQL медианы ₽-за-литр по style_category (учитываются только листинги с price и volume_ml; web и untappd-menu source_type)
- [ ] #2 bot-recommend.ts: отклонение от медианы стиля попадает в score (бонус value) и в reasons[] человекочитаемой фразой
- [ ] #3 Интент #9 «стоит ли брать» включает value-вердикт: цена этого листинга vs медиана стиля и vs другие продавцы того же сорта
- [ ] #4 Graceful degradation: пустой style_category или volume_ml → сигнал просто пропускается без ошибки
<!-- AC:END -->
