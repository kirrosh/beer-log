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
- [~] #1 Координаты: поля `lat`/`lng`/`mapUrl` в `VenueInfo`/`registry.json` есть. **Начато наполнение:**
      2 НН-бара геокожены по адресу через Nominatim (Hophead 56.3294,43.9937; Eric the Red 56.3291,43.9917;
      `geoVia:nominatim:addr`). Бизнес-имена Nominatim не берёт — путь: имя→адрес (веб) →геокод адреса.
      Остаётся ~44 точки (отдельный курируемый проход; узкое место = наполнение, см. Description).
- [x] #2 reply-keyboard `request_location` → `message.location` — **РАЗБЛОКИРОВАНО**: в форк tg-tabs
      (server.ts) добавлен handler `message:location` → `handleInbound` с `extraMeta {lat,lng}`; геопозиция
      доходит до агента в `meta.lat/lng`. Кнопка — `beerlog buttons --location-button`. Live-радиус считает
      haversine (проверено: Hophead 0.20 км от центра, `geoRadiusActive:true`).
- [x] #3 Inline-кнопки разблокированы (callback-реле́й, TASK-44): карта к точке — `--url-buttons`,
      выбор/действие — `--callback-buttons` (meta.callback_data). Богатая карточка = `beerlog photo`
      (обложка+подпись) + кнопки. `sendVenue` как отдельный примитив не нужен.
- [x] #4 Сортировка/фильтр: `haversineKm()` + `isBarLike` в `venue-registry.ts`; `bot-nearby.ts`
      сортирует по дистанции при заданных координатах юзера, иначе бар→магазин→объём пула.
- [x] #5 `mapUrl` = deeplink-поиск Яндекс.Карт по имени+городу (`mapUrlFor`) — карта как назначение.
- [ ] #6 ОПЦ. мини-апп LocationManager — не делал (после бот-версии).
- [x] #7 Честная рамка зафиксирована: SKILL #6 и `bot-nearby` (`note`/`geoRadiusActive`) различают
      два режима — есть локация+координаты → радиус (haversine); иначе по релевантности с честной
      пометкой. Радиус теперь рабочий, но `geoRadiusActive:false` остаётся для точек без координат.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Координат нет (venue-registry.ts VenueInfo, registry.json — только city). В НН реестр почти пуст (физически наполнен только Beer Mug через хардкод) → гео в НН покажет 1-2 точки до наполнения. Сиблинг TASK-41 даёт сами маркеры (живой/выбор из чек-инов); этот таск добавляет гео-слой (координаты + haversine).

**Канал (реш. Кирилл 2026-06-04):** основное взаимодействие = БОТ (команды + текст + ответы текстом), мини-апп — презентационный слой («красивая картинка»). Поэтому гео-флоу строим в боте: reply-keyboard `KeyboardButton{request_location:true}` → `message.location` → текстовый ответ со списком. Сейчас бот обрабатывает только текст-команды — добавить location-handler. Мини-апповый `Telegram.WebApp.LocationManager` (Bot API 8.0) — опциональная витрина после бот-версии, не приоритет.

**Реализация (2026-06-05) — что сделано и два реальных блокера.** Сделано: `bot-nearby.ts` +
`beerlog nearby` (точки города с маркерами 🍺/🛒/📦 и `mapUrl` к каждой), `haversineKm`/`mapUrlFor`/
`isBarLike` экспортированы из `venue-registry.ts`, поля `lat`/`lng`/`mapUrl` в `VenueInfo`, честная
рамка в SKILL #6. Smoke по НН даёт 6 баров с картами.
**Блокер A (плагин) — СНЯТ (2026-06-07):** в форк tg-tabs (server.ts) добавлен handler `message:location`
→ `handleInbound(..., extraMeta {lat,lng})`; геопозиция доходит до агента в `meta.lat/lng`. Кнопка запроса —
`beerlog buttons --location-button` (reply-keyboard `request_location`). Тем же заходом снят inline-блокер #3:
форк реле́ит не-perm callback_query (см. TASK-44, `relayCallback`). Правлены обе копии форка — **нужен рестарт бота**.
**Блокер B (данные) — В РАБОТЕ:** геокодинг по бизнес-имени ненадёжен (Nominatim берёт адреса, не названия).
Рабочий путь: имя→адрес (веб-поиск 2ГИС/Яндекс) →геокод адреса (Nominatim, free). Так заведены 2 НН-бара
(Hophead, Eric the Red). Остаётся ~44 точки — отдельный курируемый проход (можно субагентами: имя→адрес→коорд,
оркестратор пишет в registry.json по `research-subagents-no-db-write`).
<!-- SECTION:NOTES:END -->
