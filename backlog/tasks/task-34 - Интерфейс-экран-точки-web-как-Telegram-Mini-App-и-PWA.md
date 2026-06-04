---
id: TASK-34
title: 'Интерфейс: экран точки (web) как Telegram Mini App + PWA, бот-лаунчер'
status: To Do
assignee: []
created_date: '2026-06-04 12:00'
milestone: 'M4: Поиск на точке'
labels:
  - ui
  - telegram
dependencies:
  - TASK-33
references:
  - packages/web
  - vault/strategy/m4-craft-locator.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Трек C. Решение 2026-06-04: один web на существующем SvelteKit (`@beer-log/web`, adapter-static) →
работает И как Telegram Mini App, И как PWA вне TG. Снимает риск доступности TG. Бот тонкий: лаунчер
мини-аппа + приём фото полки + уведомления. Бот-UI с нуля НЕ строим.
Экран точки `/venue/[id]`: поиск (TASK-30) + список кран/холодильник + фильтры (TASK-32) + личные срезы
(TASK-33). Старт — минимальный, без дизайна-конфетки.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Роут `/venue/[id]` в @beer-log/web: пул точки (кран+холодильник), поиск-строка, базовые фильтры
- [ ] #2 Telegram Mini App: WebApp SDK (initData/тема), запуск из бота; бот — лаунчер + приём фото→оцифровка
- [ ] #3 PWA: manifest + работа вне TG (открыть по ссылке / на дом. экран). Один билд обслуживает оба
<!-- AC:END -->

## Implementation Notes
<!-- SECTION:NOTES:BEGIN -->
adapter-static → данные точки предэкспортить в JSON (catalog:export), поиск клиентский для малого объёма; при росте — лёгкий API. У проекта уже есть TG-интеграция (plugin) для бота-лаунчера/приёма фото. Дизайн — позже (frontend-design skill).

### #1 сделано (2026-06-04)
Решение по данным: НЕ предэкспорт в снапшот, а **лёгкий живой API** (`scripts/venue-server.ts`,
Bun.serve :5174) — переиспользует `venue-search.ts`/`venue-personal.ts` 1:1 на bun:sqlite, данные
точки свежие без пересборки. Эндпоинты: `GET /api/venues`, `/api/venue/:id`, `/api/venue/:id/search?q=`.
- `scripts/lib/venue-registry.ts` — индекс точек из price_listings.seller (физ. точка = seller с `/`,
  веб-магазин = домен отсеивается). id = seller с `/`→`__` (обратимо). Имена из data/venues/registry.json
  (Untappd-венью) + эвристика для сети Beer Mug.
- Витрина: роут `/venue/[id]` + `/venues` (список) — client-only (`ssr=false`, `prerender=false`),
  тянут API. Vite-прокси `/api`→:5174 (dev), adapter-static получил `fallback: "200.html"` для SPA-роутов.
  Шапка: ссылка «Точки». Экран: поиск-каскад (exact→fuzzy→brewery→absent→none с тон-бейджами) +
  личные срезы (Топ точки/От любимых/Не пробовал) + пул с фильтром формата и текстом + провенанс/возраст.
- Запуск у полки: `bun run venue:dev` (API + витрина) или раздельно `venue:api` + `web`.
- Проверено: typecheck/svelte-check чисто, `web:build` (static+fallback) зелёный, e2e в браузере
  (рендер, каскад «Джавс атомная»→brewery, личные срезы, фильтры пула).

Открытый хвост для #2/#3: API сейчас локальный процесс — для прод-хостинга Mini App/PWA нужен либо
node-adapter с эндпоинтами, либо вынести API на хост. Линк пул→`/beer/[slug]` работает (beerSlug в payload).
<!-- SECTION:NOTES:END -->
