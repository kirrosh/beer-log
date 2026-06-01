# Операционный конвейер — как ведётся сбор (полу-автономно)

Как Beer Log наполняется и поддерживается с минимумом ручного труда ([[autonomy]]:
цель ~95% автономии, человек — куратор). Кладёт [[sourcing-strategy|3-слойную стратегию]]
на конкретные сущности, стадии, скрипты и скиллы. Человек валидирует только на гейтах.

## Сущности и стадии (это и есть «чеклисты»)

| Сущность | Стадии |
|---|---|
| **Пивоварня** | `discovered` → `sourced` (найдены TG/VK/сайт/Untappd/карты) → `ingested` (сорта, status auto) → `validated` (курир. чистка) → `demand_linked` (цены/наличие) |
| **Магазин** | `discovered` → `parseable` (парсер есть / manual / blocked) → `scanned` (дата+кол-во) → `recurring` (в расписании, история цен) |
| **Город** | `discovered` → `shops_found` (топ-N крафт-магазинов) → `shops_scanned` |

## Два слоя состояния

- **Данные (data plane)** — `data/catalog.sqlite`: пивоварни, сорта, листинги, цены,
  снапшоты. Единственный источник правды по фактам. Экспорт витрины — `export-catalog.ts`.
- **Процесс (control plane)** — выводится скриптом, не дублируется:
  - `scripts/pipeline-status.ts` — ВЫВОДИТ стадию каждой сущности из БД + `ingest-hints.json`
    + `breweries.links`, печатает дашборд + **очередь следующих действий**, пишет
    `data/pipeline/state.json`. Read-only по каталогу.
  - `data/pipeline/overrides.json` — РУЧНЫЕ флаги, что не выводимы: `blocked` (причина),
    `priority`, `needsReview` (спорное на промоушне). Единственное, что человек правит руками.

То есть «чеклисты» не ведутся вручную — они вычисляются. Дашборд = живой чеклист + очередь.

## Скрипты (повторяемые шаги)

| Шаг | Скрипт |
|---|---|
| Трекинг/дашборд | `scripts/pipeline-status.ts` |
| TG-инкремент | `scripts/fetch-channels.ts` → `scripts/ingest-sorts.ts` (см. `data/ingest/RUNBOOK.md`) |
| Untappd сорта | `scripts/ingest-untappd.ts` (MAP slug→URL) |
| Магазин (точечно/полный) | `scripts/ingest-shop.ts` / `scripts/ingest-shop-full.ts` |
| Промоушн auto→validated | `scripts/promote-sorts.ts` (применяет решения скилла) |
| Экспорт витрины | `scripts/export-catalog.ts` |

## Скиллы (агентные шаги-суждения, `.claude/skills/`)

| Скилл | Когда | Делает |
|---|---|---|
| `brewery-research` | стадия `discovered→sourced` | найти/верифицировать все источники пивоварни → `links`/`ingest-hints` |
| `promote-sorts` | стадия `ingested→validated` | чистка имён, дедуп/слияние, отсев не-пива, валидация уверенных; спорные → review |
| `shop-discovery` | город `shops_found`, demand | найти топ крафт-магазинов, оценить парсибельность, завести в реестр |

Парсеры источников: `@beer-log/parsers` (`parseChannelHtml` TG, `parseUntappdBeerList`,
`parseInsalesProducts` магазины). Новый источник → новый парсер по интерфейсу `Parser`
([[parser-architecture]], самовосстановление по `healthCheck`).

Скиллы + скрипты + раннбуки + данные каждой сущности собраны в **бандлы-«ресёрчеры»** с
единым контрактом (глаголы жизненного цикла, владеемые действия очереди, model-тиринг,
гейты) — [[entity-researchers]] (TASK-22). Эти стадии/скрипты/скиллы — их частные
реализации; спайн оркестрации ниже ресёрчеры не трогают.

## Цикл одного витка (полу-автономно)

1. `pipeline-status.ts` → очередь действий (что на какой стадии застряло).
2. По очереди дёргаем нужный скилл/скрипт:
   - нет источников → `brewery-research`;
   - есть источник, нет сортов → `ingest-*`;
   - есть auto-сорта → `promote-sorts`;
   - город без магазинов → `shop-discovery` → скан.
3. `export-catalog.ts` → снапшот витрины. Коммит. Строка в [[log]].
4. Повтор. Оркестрацию шага 2 будущий скилл `pipeline-run` возьмёт на себя.

## Гейты валидации (где человек)

- **Промоушн**: агент валидирует уверенные сам, спорные → `overrides.needsReview` → человек.
- **Источники неоднозначны / пивоварня без источников** → `blocked` или review.
- **Новый город/страна/магазин в скоуп** — решение человека (позже СНГ).
- **Заявки на добавление** (пивоварня/магазин/сорт/город) — отдельный поток, совсем позже.

## Состояние (на 2026-05-30)

72 пивоварни (12 discovered / 29 sourced / 12 ingested / 19 validated), ~980 сортов
(~458 validated / ~520 auto), 3 магазина (beerkontora 3641 листинг), 39 городов.

Связано: [[autonomy]], [[sourcing-strategy]], [[parser-architecture]], [[data-model]],
[[entity-researchers]], [[mvp]], `data/ingest/RUNBOOK.md`, `AGENTS.md`.
