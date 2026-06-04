---
id: TASK-38
title: 'Парсер Untappd venue-меню: все секции → структурные листинги с провенансом'
status: To Do
assignee: []
created_date: '2026-06-04 10:37'
labels:
  - data
  - venue
  - demand
  - untappd
  - parser
milestone: 'M4: Поиск на точке'
dependencies:
  - TASK-37
references:
  - scripts/recon-untappd-venues.ts
  - scripts/ingest-untappd.ts
  - packages/parsers
  - scripts/lib/provenance.ts
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Трек E. Распарсить публичный SSR-HTML venue-меню в структурные позиции по ВСЕМ секциям (Tap List + Bottles&Cans Russian/Imported + Rare & Special — каждая секция = свой menu_id, переключается селектором). Сейчас untappd-парсер (scripts/ingest-untappd.ts, packages/parsers) умеет только страницы пивоварни /beer — расширить на venue-меню.

Поля позиции: beer (имя + Untappd /b/<id>), brewery (имя + /w/<id>), стиль, ABV/IBU, формат, объём(ы), цена(ы) ₽, рейтинг, observed_at = таймстемп среза меню (Untappd пишет дату с точностью до часа), menu_id, venueId. Untappd-ID пивоварни и сорта СОХРАНЯТЬ — это точный матч-ключ для E3 (TASK-39).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Парсер фетчит все menu_id венью и отдаёт нормализованные позиции с провенансом (source_type=untappd-menu, observed_at=таймстемп меню)
- [ ] #2 Формат различает pour (кран, 300/150мл) vs unit (бутылка/банка) — downstream не должен их мешать; цена идёт с объёмом
- [ ] #3 Untappd-ID пивоварни (/w/id) и сорта (/b/id) сохранены в листинге как ключ матча
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Разметка проверена на Братьях Крафт (3943033): li.menu-item > .beer-details (/b/, em-стиль, /w/-пивоварня, data-rating) + .beer-prices (.size/.price); ростер пивоварен с counts — в select#brewery_picker. Цены кранов by-pour, банок by-unit — критично для E4. recon-скрипт уже парсит ростер и nearby — переиспользовать regex/подход.
<!-- SECTION:NOTES:END -->
