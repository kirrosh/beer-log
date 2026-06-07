---
id: TASK-44
title: >-
  Фото → ассортимент точки: распознавание через Claude Code + Telegram MCP
  (контракт vision→строки→каскад)
status: In Progress
assignee: []
created_date: '2026-06-04 17:31'
updated_date: '2026-06-07 08:50'
labels:
  - venue
  - vision
  - telegram
  - demand
  - freshness
milestone: 'M4: Поиск на точке'
dependencies:
  - TASK-45
  - TASK-30
  - TASK-29
references:
  - scripts/telegram-bot.ts
  - scripts/lib/venue-search.ts
  - scripts/ingest-shelf.ts
  - scripts/lib/provenance.ts
  - packages/store/src/repo.ts
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Сфоткал кран-борд / меню / холодильник / банку → распознали названия → нашли в каталоге → обновили ассортимент точки. Закрывает сценарии эпика A4 («что за банка в руке») и D2 («фото полки → пополнить ассортимент»).

СТАРТОВЫЙ ДВИЖОК (реш. Кирилл 2026-06-04, TASK-45): распознавание = Claude Code как САМ агент через Telegram channel плагина на боте @beer_log_bot. Не пилим свой агент с тулзами — готовый Claude слушает channel. Фото бот скачивает сам в `~/.claude/channels/telegram/inbox/` → Claude читает через Read (без MCP/сабпроцесса/своей качалки). Расход на ПОДПИСКЕ (ANTHROPIC_API_KEY не задан). Богатую выдачу (обложки/кнопки/venue) Claude шлёт сам через Bot API из Bash. Коннект готов (TASK-45), нужен /reload-plugins под новый токен.

КЛЮЧЕВАЯ АРХИТЕКТУРНАЯ ЗАКЛАДКА (контракт, переживёт смену движка): распознаватель отвечает ТОЛЬКО за извлечение сырых названий — string[]. Матчинг делает существующий каскад venue-search.ts (TASK-30), запись — recordListing. Сменим движок (Claude Code MCP → дешёвый OCR / локальный vision) — каталожный слой и запись НЕ трогаем.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Приём фото: через channel-плагин Telegram (TASK-45) фото падает в inbox, агент читает по
      `image_path`/`download_attachment` (отдельный telegram-bot.ts не нужен — бот = Claude-сессия).
- [x] #2 Контракт vision→string[]→каскад→запись зафиксирован в `beer-concierge/SKILL.md` интент #4
      (5 шагов: распознать → резолв точки → DRY-предпросмотр → запись → подтверждение). Движок-агностик.
- [x] #3 Каскад + диалоговое подтверждение: DRY-прогон `shelf --json` показывает match-rate, агент
      показывает распознанное с обложками и спрашивает «верно?» inline-кнопками ✅/✏️/❌. Реализовано:
      форк tg-tabs реле́ит не-perm callback_query в сессию (`relayCallback` в server.ts) с
      `meta.callback_data`; `tg-buttons.ts` + `beerlog buttons --callback-buttons`; флоу в SKILL #4 шаг 3.
- [x] #4 Запись через `recordListing` (ingest-shelf): добавлен приём inline `--json` (бот не пишет
      файлы), провенанс при inline = `ai-vision`; в `provenance.ts` добавлен `ai-vision` (BASE 0.6, label).
- [x] #5 Определение бара: резолв из контекста диалога или вопрос «Ты в <кандидат по HOME_CITY>?» —
      зафиксировано в SKILL #4 шаг 2.
- [x] #6 Отложенное подтверждение провенанса (ai-vision 0.6 → self 0.9 спустя время): `upgradeProvenance`
      в store/repo.ts (селектор seller/id/beerId + гард `from`, сброс seen_at), `canUpgrade`/`UPGRADE_TO_SELF_FROM`
      в provenance.ts (монотонность), CLI `upgrade-provenance.ts` → `beerlog provenance`. Тест на temp-БД зелёный.
- [x] #7 Бот-центрично: фото шлётся прямо в чат, бар из контекста/переспрос — закрыто #1/#5.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Фундамент почти готов: provenance.ts (source_type + tier + поправка на возраст) — добавить лишь 'ai-vision'; recordListing (repo.ts) уже принимает seller/seenAt/sourceType/format/price; ingest-shelf.ts — батч-прообраз с source_type=web-photo. Это интерактивная/диалоговая версия TASK-31 (фото холодильника) + приём фото в боте. Контракт vision→string[] — главная закладка под удешевление движка; матчинг и запись изолированы от того, чем распознаём.

**Telegram-механика (Bot API 10.0, июнь 2026):** у Mini App НЕТ прямого доступа к камере/галерее — фото всегда приходит боту как `message.photo` (обычная отправка в чат). Поэтому приём остаётся бот-центричным; мини-апп лишь подталкивает («закрыть в чат и сфоткать»), передавая контекст точки. Скачивание файла: бот по file_id → getFile → download (Bot API). Свежие Mini App API, релевантные смежно: `CloudStorage` (до 1024 ключей/юзер) — кандидат под быстрый локальный ввод/черновики дегустаций без серверного раунд-трипа (см. связь с D1 и TASK-43); `downloadFile`/`shareMessage` (8.0) — не для этого флоу. Камеру не закладывать — это типичная ошибка ожиданий от Mini App.

**Реализация (2026-06-05):** код-цикл замкнут — `provenance.ts` (+ai-vision 0.6), `ingest-shelf.ts`
(+inline `--json`, дефолт провенанса ai-vision при inline), `beerlog shelf`, SKILL #4 (полный флоу
с DRY-предпросмотром). DRY-smoke inline прошёл (tier=medium 0.6, матчинг работает).

**Доделано (2026-06-07):** #3 и #6 закрыты.
- **inline-кнопки (#3):** пересмотр блокера — форк tg-tabs ловит callback_query, но реле́ил только
  `perm:*`. Добавлен `relayCallback` (server.ts): не-perm callback (allowlist-gated) → channel-сообщение
  с `meta.callback_data`, `answerCallbackQuery` сразу (агент думает дольше 15-сек окна TG). `tg-buttons.ts`
  +`--callback-buttons` (валидация ≤64Б), `beerlog buttons`, SKILL #4 шаг 3 (✅/✏️/❌ + edit_message по
  message_id). Форк правлен в repo `telegram-tabs/` И cache `~/.claude/.../tg-tabs/` — **нужен рестарт бота**
  (`scripts/bot.sh`) под новый код плагина.
- **апгрейд провенанса (#6):** `upgradeProvenance` (store) + `canUpgrade`/`UPGRADE_TO_SELF_FROM`
  (provenance.ts, монотонность) + `upgrade-provenance.ts` → `beerlog provenance`. Только усиление,
  сброс свежести на сегодня. Тест на temp-БД зелёный (ai-vision→self, чужие source_type/точки не тронуты).

Остаток: **живой vision-тест на реальном фото в боте** (после рестарта — проверить и распознавание→запись,
и нажатие callback-кнопки, и `beerlog provenance`). S3-хранение фото полок (TASK-31 #1) — вне скоупа.
<!-- SECTION:NOTES:END -->
