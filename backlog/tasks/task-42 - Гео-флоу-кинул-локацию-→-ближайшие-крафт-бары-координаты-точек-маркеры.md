---
id: TASK-42
title: 'Гео-флоу: кинул локацию → ближайшие крафт-бары (координаты точек + маркеры)'
status: In Progress
assignee: []
created_date: '2026-06-04 17:31'
labels:
  - venue
  - geo
  - telegram
  - ux
milestone: 'M4: Поиск на точке'
dependencies:
  - TASK-41
  - TASK-34
references:
  - scripts/lib/venue-registry.ts
  - data/venues/registry.json
  - scripts/telegram-bot.ts
  - scripts/lib/provenance.ts
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Кирилл выбирает бары по картам (2ГИС/Яндекс), но там НЕЛЬЗЯ отфильтровать именно крафтовые. Флоу: кинул геолокацию в бот → список крафт-точек от ближайших ко мне, у каждой описание-маркер (живой ли бар, большой ли выбор, сколько сортов в пуле). Решает реальную боль «куда пойти за крафтом рядом».

БЛОКЕР: у точек сейчас НЕТ координат. VenueInfo (venue-registry.ts) и data/venues/registry.json содержат только city/name/type — ни lat/lng, ни адреса, ни ссылки на карты. Поэтому ценность флоу = курируемый реестр координат крафт-точек (чего нет на картах), а не код сортировки. Узкое место — наполнение, не алгоритм.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [~] #1 Координаты: в `VenueInfo`/`registry.json` добавлены поля `lat`/`lng` (nullable) + `mapUrl`
      (вычисляемый deeplink). **Сами координаты НЕ наполнены** — отдельный ресёрч-проход (узкое место =
      наполнение, см. Description). `address` не вводил (mapUrl-поиск по имени+городу его заменяет).
- [ ] #2 reply-keyboard `request_location` → `message.location` — **ЗАБЛОКИРОВАНО**: форк-плагин
      Telegram (telegram-tabs) принимает только текст/фото, геолокацию пользователя НЕ передаёт.
      Live-радиус по локации невозможен без доработки плагина (server.ts).
- [ ] #3 Богатая карточка `sendVenue`/inline-кнопки — требует сырой Bot API (не в allowlist бота).
      Вместо этого `mapUrl`-ссылка к каждой точке в текстовом ответе.
- [x] #4 Сортировка/фильтр: `haversineKm()` + `isBarLike` в `venue-registry.ts`; `bot-nearby.ts`
      сортирует по дистанции при заданных координатах юзера, иначе бар→магазин→объём пула.
- [x] #5 `mapUrl` = deeplink-поиск Яндекс.Карт по имени+городу (`mapUrlFor`) — карта как назначение.
- [ ] #6 ОПЦ. мини-апп LocationManager — не делал (после бот-версии).
- [x] #7 Честная рамка зафиксирована: SKILL #6 и `bot-nearby` (`note`/`geoRadiusActive`) прямо
      говорят, что радиуса нет (нет локации + нет координат), список идёт по релевантности.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Координат нет (venue-registry.ts VenueInfo, registry.json — только city). В НН реестр почти пуст (физически наполнен только Beer Mug через хардкод) → гео в НН покажет 1-2 точки до наполнения. Сиблинг TASK-41 даёт сами маркеры (живой/выбор из чек-инов); этот таск добавляет гео-слой (координаты + haversine).

**Канал (реш. Кирилл 2026-06-04):** основное взаимодействие = БОТ (команды + текст + ответы текстом), мини-апп — презентационный слой («красивая картинка»). Поэтому гео-флоу строим в боте: reply-keyboard `KeyboardButton{request_location:true}` → `message.location` → текстовый ответ со списком. Сейчас бот обрабатывает только текст-команды — добавить location-handler. Мини-апповый `Telegram.WebApp.LocationManager` (Bot API 8.0) — опциональная витрина после бот-версии, не приоритет.

**Реализация (2026-06-05) — что сделано и два реальных блокера.** Сделано: `bot-nearby.ts` +
`beerlog nearby` (точки города с маркерами 🍺/🛒/📦 и `mapUrl` к каждой), `haversineKm`/`mapUrlFor`/
`isBarLike` экспортированы из `venue-registry.ts`, поля `lat`/`lng`/`mapUrl` в `VenueInfo`, честная
рамка в SKILL #6. Smoke по НН даёт 6 баров с картами.
**Блокер A (плагин):** форк telegram-tabs (server.ts) парсит только text/caption/photo — `message.location`
не доходит до агента. Live-радиус требует доработки плагина (добавить location в формирование `<channel>`).
**Блокер B (данные):** `lat`/`lng` у точек пусты — нужен ресёрч-проход (геокодинг по name+city или адресам
Beer Mug; Untappd координат не отдаёт). До наполнения haversine не на чем считать, поэтому ответ —
по релевантности + ссылки на карту (что уже полезно: «куда пойти» с кликом на карту).
Inline-кнопки/`sendVenue` (#3) — сырой Bot API, не в allowlist бота.
<!-- SECTION:NOTES:END -->
