---
id: TASK-34
title: 'Интерфейс: экран точки (web) как Telegram Mini App + PWA, бот-лаунчер'
status: Done
assignee: []
created_date: '2026-06-04 12:00'
updated_date: '2026-06-07 08:50'
labels:
  - ui
  - telegram
milestone: 'M4: Поиск на точке'
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
- [x] #2 Telegram Mini App: WebApp SDK + бот-лаунчер (минимальный). Приём фото — вынесен (TASK-31)
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

### #2 сделано (2026-06-04) — минимальный бот + мини-апп
Бот тонкий (лаунчер), приём фото вынесен в TASK-31.
- `scripts/telegram-bot.ts` — Bun + чистый fetch к Bot API, long polling (боту HTTPS не нужен).
  Функции: `/start` (web_app-кнопка «Открыть у полки»→/venues), `/venues` (точки inline-web_app-кнопками,
  каждая открывает /venue/<id>), синяя menu-кнопка чата (setChatMenuButton). Токен — `.env` BOT_TOKEN.
  HTTPS-URL витрины — `WEBAPP_URL` или автодетект запущенного ngrok (его API :4040/api/tunnels).
- Мини-апп: SDK `telegram.org/js/telegram-web-app.js` в `app.html`; в `+layout.svelte` — `ready()/expand()`,
  нативный BackButton на вложенных экранах, скрытие веб-шапки/футера в TG (класс `html.in-tg`).
  Детект «внутри TG» = `platform && platform!=="unknown"` (SDK вне TG всё равно задаёт platform).
- vite `allowedHosts` пускает ngrok/cloudflare хосты в dev. Скрипты: `tunnel` (ngrok http 3000), `bot`.
- `.env.example` с BOT_TOKEN/WEBAPP_URL/VENUE_API.

Запуск у полки (3 процесса): `bun run venue:dev` → `bun run tunnel` → `bun run bot`. Затем в Telegram:
/start или menu-кнопка. **Требует от пользователя:** токен от @BotFather в `.env` (в чат не вставлять).
Проверено: typecheck/svelte-check чисто, web:build зелёный (SDK в билде), браузер — гард не активируется
вне TG (шапка видна), в TG-эмуляции шапка/футер скрыты; бот доходит до Bot API, graceful-ошибки.

Замечание: SDK-скрипт грузится и на публичной витрине (no-op вне TG) — стандартный подход, +1 внешний запрос.

Закрыто: экран точки /venue/[id] (venue-server.ts + SPA, поиск-каскад, фильтры, личные срезы) и Telegram Mini App (web-app SDK, бот-лаунчер, BackButton/MainButton/haptic) готовы. PWA (#3: manifest+service worker, работа вне Telegram) не делаем — опционально, при надобности отдельной задачей.
<!-- SECTION:NOTES:END -->
