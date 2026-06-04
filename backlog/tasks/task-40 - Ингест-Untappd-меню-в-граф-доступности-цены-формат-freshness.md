---
id: TASK-40
title: 'Ингест Untappd-меню в граф доступности: цены/формат/freshness'
status: Done
updated_date: '2026-06-04'
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
- [x] #1 Листинги из меню в графе с провенансом+форматом+observed_at; pour отдельно от unit
- [x] #2 «Цена от» не смешивает pour (кран) и unit (бутылка/банка) — по аналогии с исключением опта/кега
- [~] #3 Freshness-tier по таймстемпу меню, виден в блоке «Где найти»/мете (done); кэш ответов по венью — отложен
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Tier-A венью (бизнес-меню) делают трек A (фото-vision, TASK-31) фолбэком для Tier-B (хвост без меню). Этот ингест = быстрая полоса «Untappd-меню → ingest» из ревизии vault/strategy/m4-craft-locator.md.

**Реализация (2026-06-04).** `scripts/ingest-untappd-menu.ts <slug>/<venueId> [--seller <key>] [--no-images]`. seller по умолчанию `untappd/<slug>` (новый namespace продавца). Пишет `recordListing` по одной строке на каждый размер/цену позиции (объём идёт с ценой), `source_type=untappd-menu`, `seen_at`=дата среза меню (observed_at из updated-time), format pour/unit раздельно. Провенанс: новый SourceType `untappd-menu` в lib/provenance.ts (BASE 0.75, label «по меню заведения · Untappd (дата)») → freshness-tier виден в «Где найти»/мете через существующий tier(). **pour⊥unit:** export-catalog.ts — `isRetailPrice` теперь исключает `format==="draft"` (как опт/кег), «цена от» = только unit бутылка/банка. **Обложки (task-15):** сматченному сорту без картинки рехостим `.beer-label` в S3 (`putImage`, `setBeerImage`) — за сессию +272 обложки (Братья 99 / Hophead 101 / Игра 72), публично доступны. Прогон 3 венью: **723 листинга** (Братья 268 / Hophead 289 / Игра 166), pool точки строится (`buildPool("untappd/<slug>")`), поиск/личное работают на новом seller. ⚠️ баг TDZ при первом прогоне (const extByCt после цикла → ReferenceError молча в catch → 0 обложек) — исправлен подъёмом к верхним константам. Кэш ответов по венью (#3) — отложен (повторный фетч дёшев, freshness уже из observed_at). NEXT (опц.): пере-скан по расписанию (меню ротируется), ингест крупных боттлшопов из реестра (Пиво и Пена 1201, TBPBar 694).
<!-- SECTION:NOTES:END -->
