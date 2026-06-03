---
id: TASK-26
title: >-
  Многоканальный провенанс: уровень подтверждённости (N независимых каналов) на
  карточке сорта и в мете пивоварни
status: Done
assignee: []
created_date: '2026-06-02 10:00'
updated_date: '2026-06-03 12:31'
labels:
  - web
  - catalog
milestone: 'M2: Дрейф к реальной пользе'
dependencies:
  - task-21
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Идея (Кирилл, 2026-06-02): подавать провенанс не бинарно («варит пивоварня» да/нет), а
как **уровень подтверждённости = из скольких НЕЗАВИСИМЫХ офиц. каналов виден сорт**. Сорт,
подтверждённый и Untappd, И Telegram (а позже VK) — надёжнее, чем подтверждённый одним
каналом: две независимые публикации сошлись. Это градация доверия к канону.

Данные УЖЕ есть: task-21 положила на каждый сорт `channels: SourceChannel[]`
(`untappd | telegram | website | vk`). Сейчас (2026-06-02): 152 сорта подтверждены 2
каналами (untappd+telegram), 16158 — одним, 690 — нулём (shop-only). VK-парсер (task-13)
автоматически добавит `vk` в `channels` — провенанс новый код не потребует, поле готово.
Это чисто работа UI/меты поверх готового снапшота — без новых парсеров и миграций.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 На карточке сорта виден уровень подтверждённости: число независимых каналов + какие именно («подтверждён 2 источниками: Untappd · Telegram»), cross-source выделен бейджем
- [x] #2 Хелпер в `catalog.ts` (`confirmationLevel`/`isCrossConfirmed`/`channelLabels`/`orderedChannels`/`CHANNEL_ORDER`) — переиспользуем карточкой/списком; cross-source (≥2) визуально выделен
- [x] #3 На мете пивоварни — «богатство источников»: какими каналами покрыт канон + сколько сортов подтверждено / из них cross-source
- [~] #4 (опц.) Подсветка надёжного канона (≥2): бейдж на карточке сорта + строка на пивоварне. Фильтр-чекбокс в каталоге НЕ добавлял (опц., оставлено на потом — не плодить контролы)
- [x] #5 Дашборд (`pipeline-status.ts`): метрика «cross-source (≥2 независимых канала)» — сейчас 193, растёт по проходу и подключению VK
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Где трогать (чистый UI/данные, без БД-миграций):** `packages/web/src/lib/catalog.ts`
(хелпер уровня + лейблы — рядом с `beerConfidence`/`CHANNEL_LABEL` из task-21),
`routes/beer/[slug]` (блок провенанса — расширить нынешнюю строку каналов градацией),
`routes/brewery/[slug]` (богатство источников), `scripts/pipeline-status.ts` (метрика ≥2).

**Семантика:** «канал» = вид офиц. источника пивоварни (host `beer_sources`), магазины НЕ
канал (рамка task-21). Независимость = разные виды (untappd≠telegram≠vk≠website), не разные
URL одного вида. Не путать с «в продаже» (demand) — это второй, ортогональный сигнал.

**Связано:** task-21 (метки + `channels[]`), task-13 (VK добавит 3-й канал), task-19/
legal-boundary (рыночные факты, не рейтинги). Расширение, не переписывание task-21.

**Сделано (2026-06-03).** Чистый UI/данные поверх готового `channels[]` — без БД/миграций/парсеров.
- `catalog.ts`: хелперы `confirmationLevel(b)` (=`b.channels.length`), `isCrossConfirmed(b)` (≥2),
  `orderedChannels(b)`/`channelLabels(b)` (стабильный порядок по `CHANNEL_ORDER` untappd→tg→vk→site),
  `CHANNEL_ORDER`. Рядом с `beerConfidence`/`CHANNEL_LABEL` из task-21.
- `beer/[slug]`: строка «варит пивоварня» расширена в «подтверждён N источниками: Untappd · Telegram»;
  при ≥2 — класс `.cross` (акцент specialty) + бейдж `cross-source`.
- `brewery/[slug]`: блок «канон из источников: <каналы>` + «N из M сортов подтверждено · K cross-source
  (≥2 канала)» — derived из `beers[].channels` (union каналов, count verified, count ≥2). Без правки loader'а.
- `pipeline-status.ts`: в секции ПРОВЕНАНС добавлена строка «cross-source (≥2 независимых канала)»
  + «≥3 канала», классификация тем же `sourceChannelOfUrl`, что и экспорт. **Сейчас: 193** (≥2),
  выросло со 152 (task-26 база) благодаря проходу task-21 #5 (слияние untappd↔TG по точному slug).
- Проверка: `svelte-check` 0/0, `web:build` (пререндер) зелёный; спот-чек HTML карточки сорта
  (a-million-little-pieces → «подтверждён 2 источниками: Telegram · Untappd» + cross-source) и
  пивоварни (coven-brewery → «канон из источников» + «cross-source (≥2 канала)»).
- AC #4 (фильтр-чекбокс «надёжный канон» в каталоге) — опционален, НЕ делал: подсветка реализована
  бейджем/строкой, отдельный контрол в фильтрах task-21 #6 оставлен на потом (не плодить UI).
<!-- SECTION:NOTES:END -->
