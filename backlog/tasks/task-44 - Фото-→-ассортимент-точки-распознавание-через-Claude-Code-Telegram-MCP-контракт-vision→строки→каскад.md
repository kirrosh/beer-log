---
id: TASK-44
title: >-
  Фото → ассортимент точки: распознавание через Claude Code + Telegram MCP
  (контракт vision→строки→каскад)
status: In Progress
assignee: []
created_date: '2026-06-04 17:31'
labels:
  - venue
  - vision
  - telegram
  - demand
  - freshness
milestone: 'M4: Поиск на точке'
dependencies:
  - TASK-45
  - TASK-31
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
- [~] #3 Каскад + диалоговое подтверждение: DRY-прогон `shelf --json` показывает match-rate, агент
      показывает распознанное с обложками и спрашивает «верно?». **inline-кнопки (✅/✏️/❌) НЕ сделаны** —
      требуют сырой Bot API (не в allowlist бота); подтверждение текстовой репликой.
- [x] #4 Запись через `recordListing` (ingest-shelf): добавлен приём inline `--json` (бот не пишет
      файлы), провенанс при inline = `ai-vision`; в `provenance.ts` добавлен `ai-vision` (BASE 0.6, label).
- [x] #5 Определение бара: резолв из контекста диалога или вопрос «Ты в <кандидат по HOME_CITY>?» —
      зафиксировано в SKILL #4 шаг 2.
- [ ] #6 Отложенное подтверждение провенанса (ai-vision 0.6 → self 0.9 спустя время) — НЕ сделано,
      отдельным шагом (нужен механизм переоценки source_type существующего листинга).
- [x] #7 Бот-центрично: фото шлётся прямо в чат, бар из контекста/переспрос — закрыто #1/#5.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Фундамент почти готов: provenance.ts (source_type + tier + поправка на возраст) — добавить лишь 'ai-vision'; recordListing (repo.ts) уже принимает seller/seenAt/sourceType/format/price; ingest-shelf.ts — батч-прообраз с source_type=web-photo. Это интерактивная/диалоговая версия TASK-31 (фото холодильника) + приём фото в боте. Контракт vision→string[] — главная закладка под удешевление движка; матчинг и запись изолированы от того, чем распознаём.

**Telegram-механика (Bot API 10.0, июнь 2026):** у Mini App НЕТ прямого доступа к камере/галерее — фото всегда приходит боту как `message.photo` (обычная отправка в чат). Поэтому приём остаётся бот-центричным; мини-апп лишь подталкивает («закрыть в чат и сфоткать»), передавая контекст точки. Скачивание файла: бот по file_id → getFile → download (Bot API). Свежие Mini App API, релевантные смежно: `CloudStorage` (до 1024 ключей/юзер) — кандидат под быстрый локальный ввод/черновики дегустаций без серверного раунд-трипа (см. связь с D1 и TASK-43); `downloadFile`/`shareMessage` (8.0) — не для этого флоу. Камеру не закладывать — это типичная ошибка ожиданий от Mini App.

**Реализация (2026-06-05):** код-цикл замкнут — `provenance.ts` (+ai-vision 0.6), `ingest-shelf.ts`
(+inline `--json`, дефолт провенанса ai-vision при inline), `beerlog shelf`, SKILL #4 (полный флоу
с DRY-предпросмотром). DRY-smoke inline прошёл (tier=medium 0.6, матчинг работает). Остаток: живой
vision-тест на реальном фото в боте; inline-кнопки подтверждения (#3, нужен сырой Bot API);
отложенное поднятие провенанса ai-vision→self (#6). S3-хранение фото полок (TASK-31 #1) — вне скоупа.
<!-- SECTION:NOTES:END -->
