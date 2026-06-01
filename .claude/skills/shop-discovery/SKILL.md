---
name: shop-discovery
description: Найти топ крафтовых магазинов (по РФ или по городу), классифицировать платформу/парсибельность, завести в реестр магазинов для demand-парсинга. Используй по запросу "найди магазины <города>"/"топ крафт-магазинов", или для стадии города shops_found.
---

# Discovery магазинов (Demand-слой)

> **Модель (лимиты):** запускай субагентом на **sonnet** (веб-поиск магазинов + классификация
> ассортимента/платформы). Проверку парсибельности (raw curl + grep) и ингест — детерминированно,
> без opus. **haiku** годится для чистого fetch/grep-чека разметки.

Цель: наполнить реестр магазинов, из которых тянем цены/наличие/скидки (task-10).
Магазины — вторичный источник (sourcing-strategy, слой 3), но именно тут сигнал спроса.

## Шаги

1. Веб-ресёрч (WebSearch): «крафтовое пиво магазин <город>», «доставка крафта <город>»,
   боттлшопы, профильные агрегаторы (profibeer, beers.su, your.beer). Цель — топ-5
   (потом больше) по городу или по РФ.
2. По каждому кандидату быстро оцени **парсибельность** (как делали для beerkontora):
   ```bash
   curl -sL -A "Mozilla/5.0 ... Chrome/120" "https://<shop>/" -o /tmp/s.html -w "HTTP %{http_code} %{size_download}\n"
   grep -oc 'product\|tovar\|item' /tmp/s.html   # есть ли товары в server-rendered HTML
   ```
   - **InSales** (как beerkontora) → переиспользуй `parseInsalesProducts` (карточка `.product-preview`,
     коллекции по пивоварням). Маркеры: `insales`, `data-product-id`, `product-preview`.
   - server-rendered, иная разметка → новый парсер в `packages/parsers/src/shops/`.
   - client-rendered (React/Vue, пусто в HTML) → нужен браузерный рендер → пометь `blocked`.
3. Классифицируй ассортимент: росс. крафт vs импорт vs мейнстрим (как в
   `data/discovery/beerkontora-ru-craft.json`). В канон — только росс. крафт; импорт — листингами.
4. Заведи в реестр магазинов `data/pipeline/shops.json` (создай, если нет):
   `{ "shops": [{ "id":"<slug>", "name":"...", "city":"...", "url":"...", "platform":"insales|custom|blocked", "status":"discovered|parseable|scanned", "lastScan":null, "ruCraftMapFile":null }] }`
5. Для parseable: построй/настрой ингест (InSales → расширь `ingest-shop-full.ts`/`ingest-shop.ts`
   карту; иной движок → новый парсер). Запусти скан → `recordListing` (цены/наличие/снапшоты).
6. Обнови дашборд: `bun run scripts/pipeline-status.ts` (магазин появится с листингами).

## Правила
- Парсибельность проверяй raw-fetch ДО написания парсера (как Untappd/beerkontora).
- Цены: помечай опт (за упаковку) vs розница (за ед.) — влияет на сравнение/headline-цену.
- Не дубли городов/магазинов: сверяйся с `data/pipeline/state.json` и `breweries.city`.
- Повтор во времени (история скидок) — задача расписания; `recordListing` детект скидки уже умеет.

Связано: `vault/product/sourcing-strategy.md`, `vault/product/operating-pipeline.md`,
`packages/parsers/src/shops/insales.ts`, `scripts/ingest-shop-full.ts`.
