---
id: TASK-40
title: 'Ингест Untappd-меню в граф доступности: цены/формат/freshness'
status: To Do
assignee: []
created_date: '2026-06-04 10:37'
labels:
  - data
  - demand
  - untappd
  - availability
milestone: 'M4: Поиск на точке'
dependencies:
  - TASK-39
references:
  - packages/catalog-core/src/models.ts
  - scripts/lib/provenance.ts
  - scripts/export-catalog.ts
  - vault/strategy/availability-moat.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Трек E. Записать matched-позиции меню как листинги в граф доступности (PriceListing) с source_type=untappd-menu, форматом, ценой+объёмом, observed_at, venueId, menu_id.

Краны (by-pour, 300/150мл) держать ОТДЕЛЬНО от unit-цен бутылок/банок — не мешать в розничную «цена от» (как опт и кег уже исключены в export-catalog). Для сопоставимости pour можно нормировать на литр.

Freshness: observed_at = таймстемп меню (часы) → tier (provenance.ts). Кэш ответов по венью. Питает мету (цены, reach, что льют по стране) и экран точки M4 (TASK-34) — для Tier-A венью это веб-fast-lane вместо фото-оцифровки (TASK-31 = фолбэк Tier-B).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Листинги из меню в графе с провенансом+форматом+observed_at; pour отдельно от unit
- [ ] #2 «Цена от» не смешивает pour (кран) и unit (бутылка/банка) — по аналогии с исключением опта/кега
- [ ] #3 Freshness-tier по таймстемпу меню, виден в блоке «Где найти»/мете; кэш по венью
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Tier-A венью (бизнес-меню) делают трек A (фото-vision, TASK-31) фолбэком для Tier-B (хвост без меню). Этот ингест = быстрая полоса «Untappd-меню → ingest» из ревизии vault/strategy/m4-craft-locator.md.
<!-- SECTION:NOTES:END -->
