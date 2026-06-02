# Ресёрчеры по сущностям — единый контракт

Идея (Кирилл, 2026-06-01): у каждой **сущности** (пивоварня / сорт / магазин) — свой
«ресёрчер»: самодостаточный бандл **skill + скрипты + инструкция + данные**, владеющий
полным жизненным циклом этой сущности. Сейчас тулинг разложен по *стадиям*, и цикл
сущности размазан между скиллами, скриптами, раннбуками и памятью. Эта страница —
консолидация: формализует то, что УЖЕ работает, в единый сущностный контракт поверх
существующего control-plane ([[operating-pipeline]]). Спайн оркестрации
(`pipeline-status --plan` → `pipeline-run`) НЕ переписываем — ресёрчеры в него
подключаются единообразно.

Связано: [[operating-pipeline]] (стадии и control plane), [[autonomy]] (~95% автономии —
это её конкретная форма), [[parser-architecture]] (самовосстановление на уровне
shop-ресёрчера), [[sourcing-strategy]] (слои источников). Задача — TASK-22.

## Контракт «Ресёрчера»

Ресёрчер — это **логический бандл** вокруг одной сущности, реализующий общий жизненный
цикл и декларирующий своё подключение к конвейеру. Не новый рантайм, а конвенция.

### Глаголы жизненного цикла (общие для всех сущностей)

| Глагол | Что делает | Чем реализован (типично) |
|---|---|---|
| `discover` | найти инстансы сущности (кто/что существует) | seed-скрипты, discovery-скилл |
| `source` / `research` | найти и верифицировать источники инстанса | research-скилл (веб-сбор + суждение) |
| `ingest` / `parse` | вытащить факты из источника в БД | парсер (`@beer-log/parsers`) + ingest-скрипт |
| `match` / `dedup` | связать с каноном, слить дубли | `catalog-matcher`, `rematch-listings` |
| `validate` / `curate` | курир. чистка, отсев мусора, промоушн | curate-скилл (суждение) + детерм. применитель |
| `refresh` / `liveness` | переобойти — источники/цены устаревают | brewery **TASK-24 ✅** / shop **TASK-25 ✅** (по давности `lastRun`/`lastScan` → план); city — пробел |
| `report-stage` | вывести стадию инстанса для очереди | входы в `pipeline-status.ts` (БД + hints + links) |

Не каждая сущность реализует все глаголы, и реализация у каждой своя — но **набор глаголов
один**. Это и делает онбординг новой сущности-инстанса единообразным.

### Что ресёрчер ДЕКЛАРИРУЕТ

1. **Владеемые действия очереди** — какие `action` из `pipeline-status --plan`
   (`brewery-research` / `ingest-sorts` / `promote-sorts` / `demand` / …) принадлежат
   этому ресёрчеру. Один `action` ⇒ ровно один ресёрчер-владелец.
2. **Входы для деривации стадии** — из чего `pipeline-status` выводит стадию инстанса
   (таблицы БД, поля `ingest-hints`, `breweries.links`, `shops.json`).
3. **Model-тиринг** — какой тир субагента на каком глаголе (см. ниже, память:
   model-тиринг субагентов).
4. **Гейты** — где останавливается на человека (`overrides.json`:
   `needsReview` / `blocked`, решения о скоупе).

### Per-instance state — конвенция

Состояние инстанса разнесено по двум планам ([[operating-pipeline]]):

- **Data plane** — `data/catalog.sqlite` (единственный источник правды по фактам).
- **Control plane** — выводится `pipeline-status.ts`, руками только `overrides.json`.
- **Ad-hoc рабочие формы** ресёрчера — `data/<entity>/<slug>.json` (промежуточный
  результат глагола до применения в БД). Сейчас формы разные у каждой сущности
  (`research/<slug>.json`, `promotions/<slug>.json`, реестр `shops.json`) —
  **целевая конвенция**: единый префикс на сущность, поля по контракту, применитель
  детерминирован. Унификация форм — инкрементально, не ломая существующее.

### Model-тиринг (память: model-тиринг субагентов)

- **haiku** — чистый fetch / extract / grep-чек разметки, без суждения.
- **sonnet** — веб-ресёрч, матч/дедуп, чистка имён, классификация (средн. суждение).
- **opus** — только сложные неоднозначные случаи и архитектурные решения.

Каждый skill уже несёт строку «Модель (лимиты)» — это и есть декларация тира на уровне
бандла; контракт лишь возводит её в общее правило.

### Гейты (где человек)

Промоушн спорных (`needsReview`), пивоварня без источников / неоднозначные источники
(`blocked`), новый город/страна/магазин в скоуп — решение человека. Ресёрчер их НЕ
проходит сам (рамка [[autonomy]]).

## Бандлы сущностей (манифест существующего)

Организация того, что есть, — без переписывания (TASK-22 #3).

### 1. Brewery-ресёрчер

Цикл: `discovered → sourced → ingested → validated → demand_linked`.

| Элемент | Что |
|---|---|
| Skill | `brewery-research` (источники: TG/VK/сайт/Untappd/карты) |
| Скрипты | `seed-breweries`, `seed-rcb-breweries`, `seed-top-breweries` (discover); `apply-research` (применить ресёрч) |
| Данные | `data/research/<slug>.json`, `data/ingest-hints.json`, `breweries.links`, `overrides.breweries` (blocked) |
| Владеет action | `brewery-research` |
| Стадия из | `breweries` + `links` + `ingest-hints` (sources), счётчики `beers` |
| `refresh/liveness` (**TASK-24 ✅**) | content-refresh по давности (TG `lastRun`>3д → `refresh-tg` инкремент; Untappd `untappd.lastRun`>14д → `refresh-untappd` page-1) + liveness-проба `check-liveness.ts` (HTTP/redirect/empty) → протухший источник всплывает в плане как `brewery-research`. Пороги — `FRESH` в `pipeline-status.ts` |

### 2. Sort/Beer-ресёрчер

Цикл: `ingest(TG/Untappd) → match → promote → provenance`.

| Элемент | Что |
|---|---|
| Skill | `promote-sorts` (auto→validated) |
| Скрипты | `fetch-channels`, `ingest-sorts` (TG); `ingest-untappd`, `ingest-untappd-collected` (Untappd); `catalog-matcher`, `rematch-listings` (match); `promote-sorts` (применитель) |
| Раннбуки | `data/ingest/RUNBOOK.md` (TG-инкремент), `data/ingest/breadth-backfill.md` (Untappd по ширине) |
| Данные | `data/pipeline/promotions/<slug>.json`, `data/ingest/sorts-<date>/`, `beer_sources` (провенанс) |
| Владеет action | `ingest-sorts`, `promote-sorts` |
| Стадия из | счётчики `beers.status` (auto/validated), `beer_sources` |
| **Пробел** | не собран как один связный ресёрчер; VK-источник (TASK-13); провенанс-метки сделаны (TASK-21 #1-4), проход по shop-only каналам (TASK-21 #5) ещё впереди |

### 3. Shop-ресёрчер

Цикл: `discovered → parseable → scanned → recurring`. Бары — подтип (`platform=telegram`).

| Элемент | Что |
|---|---|
| Skill | `shop-discovery` (найти + классифицировать платформу/парсибельность) |
| Реестр | `data/pipeline/shops.json` (id/platform/status/lastScan/ingest/note — уже единый и хорош) |
| Парсеры | `@beer-log/parsers`: чистые по платформе — `parseWoocommerce`/`parseBitrixCatalog`/`parseStorebeerPage`/`parseTelegramTapList` (shops/platforms.ts) + `parseInsalesProducts` |
| Скрипты | **единый движок** `ingest-shop-platform.ts <id>` (платформа из `shops.json.ingestConfig`) → `scripts/lib/shop-ingest.ts`; by-collection beerkontora — отдельно `ingest-shop.ts` |
| Данные | реестр `data/pipeline/shops.json` (+ `ingestConfig`: platform/seller/idPrefix/endpoint/catalogs/…) |
| Владеет action | `demand` (скан магазинов города) |
| Стадия из | `shops.json` (status/lastScan) + наличие листингов в `price_listings` |
| **Пробел (закрыт)** | единый ingest по платформе — **TASK-23 Done**. `recurring/freshness` — **TASK-25 ✅** (`lastScan`>7д или null → `rescan-shop` единым движком; `lastScan` пишется автоматически после реального скана; история цен — `price_snapshots`; витрина — флаг `stale`>14д на «Где найти»). Остаётся самовосстановление парсера ([[parser-architecture]], TASK-5) |

### 4. City/geo

Цикл: `discovered → shops_found → shops_scanned`. Это скорее **сквозной scope-юнит**, а не
полноценный ресёрчер: у города нет своих источников/парсеров — он группирует магазины.
Решение: оставить тонким geo-вью внутри shop-ресёрчера (action `demand` по городу
пивоварни), не плодить отдельный бандл.

## Пробелы и под-задачи (TASK-22 #4)

| Пробел | Сущность | Приоритет | Под-задача |
|---|---|---|---|
| Единый shop-ingest по платформе (bitrix/woocommerce/insales/custom-json/telegram) — магазин = конфиг в `shops.json`, не bespoke-скрипт | shop | **high** (макс. практ. выигрыш, proof контракта) | **TASK-23** (= TASK-22 #5) |
| `refresh/liveness` пивоварни — переобход устаревших источников | brewery | medium | **TASK-24 ✅** |
| `recurring/freshness` магазинов — перескан по расписанию, история цен | shop | medium | **TASK-25 ✅** |
| VK-источник как глагол sort/brewery-ресёрчера | sort/brewery | — | TASK-13 (есть) |
| Самовосстановление парсеров (healthCheck → фиксер) | shop | deferred | TASK-5 (есть) |
| Провенанс-метки сорта + проход по shop-only каналам | sort | — | TASK-21 (#1-4 done, #5 проход) |

## Что НЕ делаем этой консолидацией

Не переписываем рабочий конвейер и не трогаем спайн оркестрации. `pipeline-status`/
`pipeline-run` остаются как есть; ресёрчеры — это организация существующих бандлов плюс
явные пробелы. Код-консолидация (единый shop-ingest) идёт отдельным proof-срезом
(TASK-23), на нём контракт проверяется «в бою».
