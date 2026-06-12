---
id: TASK-55
title: 'Петля обратной связи: бот сам спрашивает «как тебе вчерашнее?»'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-11 09:49'
updated_date: '2026-06-12 09:00'
labels:
  - personal
  - bot
  - ux
milestone: 'M5: Рекомендации, метрики выбора и канон'
dependencies:
  - TASK-46
references:
  - data/personal/tastings.json
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Важнейший недостающий UX-элемент: без замыкания петли дегустации не копятся и вся личная модель мертва. После фиксации «беру/пробую» (интент дегустации или рекомендация) бот на следующий день сам спрашивает вердикт 🔥/👍/👎 + wouldRepeat и пишет в tastings.json. Память бота — живая сессия (Telegram MCP не хранит историю), поэтому pending-вопросы хранить в файле bot-context, не в голове агента. Описание майлстоуна: backlog/docs/doc-1.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Фиксация «беру/пробую X» создаёт pending-запись (beerId, beer, venue, дата) в файле bot-context
- [ ] #2 Механизм «на следующий день»: при старте сессии/по расписанию бот находит созревшие pending и задаёт вопрос в TG-топик
- [ ] #3 Ответ пользователя (вердикт + опц. wouldRepeat/заметка) пишется в tastings.json через существующий флоу TASK-46
- [x] #4 После ответа или явного отказа pending закрывается и не достаётся повторно; протухшие (>7 дней) архивируются молча
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

### 1. Модуль pending-tastings

Создать scripts/lib/pending-tastings.ts и файл хранилища data/personal/.pending-tastings.json (добавить в .gitignore по образцу .bot-context.json).

Структура записи: { id, beerId, beer, venue, chat, thread, createdAt, askedAt, status } где status — pending / asked / closed / stale.

API модуля:
- addPending — добавить новую запись
- ripePendings — вернуть созревшие: createdAt < сегодня, status=pending или status=asked без ответа
- closePending(id) — закрыть запись
- archiveStale — перевести в stale записи старше 7 дней (молча)

### 2. CLI scripts/pending-tasting.ts, регистрация в beerlog.ts как beerlog pending

Подкоманды:

add --json — агент фиксирует момент «беру/пробую X» после рекомендации или фото. Поля: beer, beerId, venue, chat, thread (AC #1)

list — вывести текущее состояние всех pending-записей

ask [--dry-run] — найти созревшие (createdAt вчера и раньше), для каждой: отправить вопрос в TG-топик напрямую через Bot API (sendMessage с inline callback-кнопками 🔥/👍/👎/«не пробовал», по образцу tg-buttons.ts), проставить askedAt, выставить bot-context setLastBeer(chat, thread) — чтобы голый ответ привязался через fromContext-путь record-tasting. Попутно archiveStale. При --dry-run вывести список без отправки. (AC #2, #4)

close <id> — закрыть запись после записи дегустации или отказа (AC #4)

### 3. Cron-триггер «на следующий день»

Добавить cron-запись (crontab, раз в день ~12:00):
  bun run scripts/beerlog.ts pending ask из корня репо

Отправка идёт напрямую через Bot API — не зависит от живости сессии бота. Ответ пользователя прилетает в сессию обычным channel-сообщением через роутер. Ручной запуск также валиден.

### 4. Обновление SKILL.md beer-concierge, интент #5 (дегустация)

Дополнить секцию тремя ветками:

(а) «беру/попробую X» после рекомендации или фото → beerlog pending add с контекстом беседы (AC #1)

(б) Ответ пользователя на вопрос бота (текст или callback_data кнопки) → beerlog tasting (AC #3, бот-контекст уже выставлен на шаге ask) → beerlog pending close <id>

(в) «не пробовал / потом / пропустить» → beerlog pending close <id> без записи дегустации

### 5. Тесты

Unit-тесты на pending-tastings lib (temp-dir изоляция):
- add/ripe/stale/close базовые сценарии
- Граница 1 день: createdAt=сегодня НЕ попадает в ripePendings
- Граница 7 дней: archiveStale переводит в stale ровно на 8-й день

Smoke-тест: pending ask --dry-run без реальной отправки в TG

Цель: bun test + typecheck зелёные
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Реализация (2026-06-12): lib scripts/lib/pending-tastings.ts (add/ripe/markAsked/close/archiveStale, файл data/personal/.pending-tastings.json gitignored) + CLI scripts/pending-tasting.ts → beerlog pending (add/list/ask --dry-run/close). ask шлёт вопрос напрямую Bot API с callback-кнопками fb:<id>:fire|good|pass|skip и ставит bot-context setLastBeer — голый текстовый ответ привяжется через fromContext-путь record-tasting. SKILL beer-concierge интент #5 дополнен флоу петли (намерение без вердикта → pending add; ответ → tasting + pending close; skip → close). Тесты: tests/pending-tastings.test.ts (10 зелёных: дедуп, границы созревания 1 день, архив >7 дней, чистка >30 дней), typecheck зелёный, CLI-смоук add→backdate→ask --dry-run→close прошёл.

Блокер триггера (AC #2): crontab -e запрещён macOS (Operation not permitted, нужен Full Disk Access), фолбэк-LaunchAgent ~/Library/LaunchAgents/com.beerlog.pending-ask.plist НАПИСАН (ежедневно 12:00, лог /tmp/beerlog-pending-ask.log), но launchctl bootstrap отклонён permission-классификатором — решение за Кириллом: загрузить руками / перелогин (LaunchAgents подхватываются при логине) / другой механизм.
<!-- SECTION:NOTES:END -->
