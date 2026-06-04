---
id: TASK-37
title: 'Дискавери RF-венью с Untappd-бизнес-меню: реестр точек + детект меню'
status: Done
assignee: []
created_date: '2026-06-04 10:36'
updated_date: '2026-06-04'
labels:
  - data
  - venue
  - demand
  - untappd
milestone: 'M4: Поиск на точке'
dependencies:
  - TASK-29
references:
  - scripts/recon-untappd-venues.ts
  - vault/strategy/m4-craft-locator.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Трек E (новый веб-источник холодильника+крана, открыт разведзондом 2026-06-04). Untappd-for-Business меню топ-баров/боттлшопов = оцифрованный самим заведением ассортимент с ценами/форматом/датой, машиночитаемо из публичного SSR-HTML без cookie/VPN.

Зонд (19 венью, BFS от Google-сидов, scripts/recon-untappd-venues.ts): 63% имеют бизнес-меню; 4379 priced-рёбер с 12 точек; попались боттлшопы с полным прайсом (Пиво и Пена 1200 сортов, TBPBar 694). Это опровергает старое «RU-бары почти не ведут бизнес-меню» (memory untappd-venue-not-demand-source — верно для хвоста, не для топа) и premise TASK-31 «бутылочный пул в вебе НЕдоступен» (для Tier-A доступен).

Задача: собрать реестр RF-венью с бизнес-меню. Дискавери = Google site:untappd.com/v <город> + BFS по «Nearby Verified Venues» от сидов; детект наличия меню (brewery_picker/menu-item). Классифицировать bar vs bottleshop. Аналог shop-discovery, но для венью через Untappd.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Реестр венью {untappd venueId, slug, name, city, type bar/shop, hasMenu, menuOffering} в data/ (для регулярного парса)
- [x] #2 Дискавери-метод: Google site-search сиды + BFS по nearby (учесть: nearby отдают только no-menu страницы, menu-венью — листья) + детект бизнес-меню
- [x] #3 Старт Москва+СПб+миллионники, не «весь веб» сразу; покрытие логируется (сколько с меню/без)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Скоуп-решение про «все RF-бары» одобрено Кириллом 2026-06-04 после разведзонда. nearby-граф расширяется только через no-menu венью — комбинировать с Google-сидами по городам. Топ-кандидаты новых RU-крафт-пивоварен из зонда (вне наших 247): Midnight Project, Plague Brew, Осьминогец, Заповедник, Gravity Project, Godbeerg.

**Реализация (2026-06-04).** `scripts/discover-untappd-venues.ts` → `data/venues/registry.json`. Сиды по городам (МСК/СПб/НН, расширяемо `--seeds <file>`) + BFS на nearby (только через no-menu венью — меню-венью листья, подтверждено). Детект меню — `probeOnly`-режим парсера (`fetchVenueMenus(slug,id,{probeOnly:true})`, только базовая страница: menu-selector / brewery_picker / menu-item). Классификация bar/shop/bar-shop из `<h2>`. Реестр (merge, не перезатирает): venueId/slug/name/city/type/verified/hasMenu/menuOffering/rosterSize/beersTotal/checkedAt/discoveredVia. Первый обход: 16 венью, **10 с бизнес-меню (63%, совпало с зондом)**, Σ 4069 сортов в ростерах; BFS вскрыл новые точки (Пиво и Пена 1201, TBPBar 694, Share House, Craft Republic, Перья Коня, Пиво на Ушинке). Покрытие логируется. NEXT (опц.): больше сидов по миллионникам (Google site:untappd.com/v вручную → --seeds).
<!-- SECTION:NOTES:END -->
