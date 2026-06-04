---
id: TASK-44
title: >-
  Фото → ассортимент точки: распознавание через Claude Code + Telegram MCP
  (контракт vision→строки→каскад)
status: To Do
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
- [ ] #1 Бот (telegram-bot.ts) принимает message.photo: берёт file_id, скачивает/кладёт в очередь на распознавание (Claude Code сессия с Telegram MCP читает). Сейчас бот обрабатывает только текст-команды
- [ ] #2 Контракт распознавания зафиксирован и задокументирован (data/ingest/*.md): фото → string[] сырых названий, движок-агностик стабильный интерфейс
- [ ] #3 Распознанные строки → каскад matchOnPool/nameSimilarity (TASK-30) → богатое диалоговое подтверждение: список найденных сортов с обложками (imageUrl, TASK-15) + inline-кнопки на позицию (✅ верно / ✏️ поправить / ❌ не то) и общий «Сохранить всё»; неузнанные — отдельным блоком
- [ ] #4 Подтверждённое → recordListing({seller, seenAt, sourceType, format, price}); в provenance.ts добавлен source_type 'ai-vision' (base ~0.55, машинное распознавание)
- [ ] #5 Определение бара: из контекста (открыт экран точки в мини-аппе) ИЛИ вопрос «Ты в <топ-кандидат по HOME_CITY>?» с кнопками
- [ ] #6 Отложенное подтверждение провенанса: спустя время «ты был в <бар>?» → подтверждение поднимает source_type ai-vision (0.55) → self (0.9), свежесть высокая
- [ ] #7 Бот-центрично: фото шлётся прямо боту в чат (message.photo); бар берётся из диалогового контекста (последняя выбранная точка/гео в этой сессии) либо бот переспрашивает текстом/inline-кнопками. Камеры у Mini App нет (Bot API 10.0) — это и не нужно при бот-первом подходе
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Фундамент почти готов: provenance.ts (source_type + tier + поправка на возраст) — добавить лишь 'ai-vision'; recordListing (repo.ts) уже принимает seller/seenAt/sourceType/format/price; ingest-shelf.ts — батч-прообраз с source_type=web-photo. Это интерактивная/диалоговая версия TASK-31 (фото холодильника) + приём фото в боте. Контракт vision→string[] — главная закладка под удешевление движка; матчинг и запись изолированы от того, чем распознаём.

**Telegram-механика (Bot API 10.0, июнь 2026):** у Mini App НЕТ прямого доступа к камере/галерее — фото всегда приходит боту как `message.photo` (обычная отправка в чат). Поэтому приём остаётся бот-центричным; мини-апп лишь подталкивает («закрыть в чат и сфоткать»), передавая контекст точки. Скачивание файла: бот по file_id → getFile → download (Bot API). Свежие Mini App API, релевантные смежно: `CloudStorage` (до 1024 ключей/юзер) — кандидат под быстрый локальный ввод/черновики дегустаций без серверного раунд-трипа (см. связь с D1 и TASK-43); `downloadFile`/`shareMessage` (8.0) — не для этого флоу. Камеру не закладывать — это типичная ошибка ожиданий от Mini App.
<!-- SECTION:NOTES:END -->
