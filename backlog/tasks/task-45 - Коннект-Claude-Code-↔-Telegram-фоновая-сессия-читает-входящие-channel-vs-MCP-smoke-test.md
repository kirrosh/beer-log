---
id: TASK-45
title: >-
  Коннект Claude Code ↔ Telegram: фоновая сессия читает входящие (channel vs
  MCP) + smoke-test
status: To Do
assignee: []
created_date: '2026-06-04 17:53'
labels:
  - infra
  - telegram
  - vision
  - prerequisite
milestone: 'M4: Поиск на точке'
dependencies: []
references:
  - scripts/telegram-bot.ts
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Предпосылка для TASK-44 (распознавание фото в Claude Code сессии). Нужно настроить и ПРОВЕРИТЬ, что ОТДЕЛЬНАЯ фоновая Claude Code сессия на Mac mini (не текущая интерактивная) реально получает входящие из Telegram и может прочитать содержимое — текст и ФОТО — и ответить.

Развести две механики (их легко спутать):
- (A) Telegram CHANNEL плагина Claude Code (скиллы telegram:configure / telegram:access) — транспорт «дотянуться до Claude из Telegram»: пишешь боту → Claude отвечает. Фоновый, отдельной сессией.
- (B) Telegram MCP — инструменты ЧИТАТЬ чат и СКАЧИВАТЬ фото (file_id → download). Доступ к содержимому.

Для фото-флоу (TASK-44) критичен доступ к самому изображению (B). Channel (A) — как общаешься с сессией. Возможен и третий путь: существующий telegram-bot.ts принимает message.photo и кладёт файл туда, откуда фоновая сессия его берёт (без MCP вовсе).

(D) ПРЕДПОЧТИТЕЛЬНЫЙ (реш. Кирилл 2026-06-04): telegram-bot.ts ловит message.photo, скачивает файл (getFile→download) и вызывает `claude` headless-командой (`claude -p "..."` с картинкой) как сабпроцесс → получает string[] названий → каскад. Плюсы: бот ОДИН (нет конфликта long polling), сессия не постоянная, stateless per-фото, нет отдельного MCP. КРИТИЧНО: убедиться, что headless `claude` расходует ПОДПИСКУ (Pro/Max), а НЕ API-биллинг — т.е. в env процесса НЕТ ANTHROPIC_API_KEY и аутентификация подписочная (OAuth).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 РЕШЕНО (2026-06-04): механика = (A) Telegram CHANNEL плагина Claude Code на боте @beer_log_bot (BOT_TOKEN 8999075425). Claude САМ агент (не пилим свой), готовый плагин. Бонус: channel-сервер сам качает входящие фото в `~/.claude/channels/telegram/inbox/` → доступ к содержимому без MCP/сабпроцесса (Claude читает файл через Read). Варианты B/C/D отброшены
- [ ] #1b БИЛЛИНГ через подписку проверен: headless `claude` использует Pro/Max-аккаунт, НЕ API-ключ. В env фонового процесса нет ANTHROPIC_API_KEY; залогинен подпиской; подтверждено фактически (claude /status или пробный вызов → расход на подписке, не на API)
- [ ] #2 Отдельная фоновая Claude Code сессия на Mac mini запущена и привязана к Telegram (НЕ текущая планировочная сессия)
- [ ] #3 Smoke-test текст: отправил боту/в channel сообщение → фоновая сессия получила и ответила
- [ ] #4 Smoke-test фото: отправил фото @beer_log_bot → файл лёг в ~/.claude/channels/telegram/inbox/, Claude прочитал через Read, готов отдать в распознавание (контракт TASK-44 #2)
- [ ] #5 Конфликт long polling: НЕ запускать telegram-bot.ts/bun run mini на BOT_TOKEN 8999075425 одновременно с channel (оба long-poll → 409). Channel = единственный потребитель этого токена. Мини-апп (если нужен) — web_app-кнопки шлёт сам Claude через Bot API, без отдельного long-poll бота
- [ ] #6 Токен сменён в channel .env (2026-06-04) → нужен /reload-plugins или рестарт сессии, чтобы сервер подхватил @beer_log_bot (access.json подхватился сразу). Документировать запуск фоновой сессии на Mac mini (она = «бот»)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
«Отдельно не в этой сессии» (Кирилл): распознавание живёт в фоновой сессии/процессе на Mac mini, текущая интерактивная (планирование) не блокируется. Главный технический риск варианта с двумя ботами — один токен у двух long-polling потребителей → 409 (вариант D его снимает: бот один, claude дёргается сабпроцессом). bun run mini сейчас поднимает telegram-bot.ts + ngrok (это НЕ Claude Code channel).

**Биллинг (вариант D):** headless `claude -p` берёт ту же аутентификацию, что интерактивный CLI. Если в окружении есть ANTHROPIC_API_KEY — уйдёт в API-биллинг (плата по токенам); если его нет и выполнен подписочный вход — расходует Pro/Max. → в env бота/сабпроцесса НЕ прокидывать ANTHROPIC_API_KEY; проверить фактически (claude /status показывает auth method). Это инфра-gate перед TASK-44; провенанс/recordListing/каскад от него не зависят и могут делаться параллельно.
<!-- SECTION:NOTES:END -->
