---
id: TASK-55
title: 'Петля обратной связи: бот сам спрашивает «как тебе вчерашнее?»'
status: To Do
assignee: []
created_date: '2026-06-11 09:49'
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
- [ ] #1 Фиксация «беру/пробую X» создаёт pending-запись (beerId, beer, venue, дата) в файле bot-context
- [ ] #2 Механизм «на следующий день»: при старте сессии/по расписанию бот находит созревшие pending и задаёт вопрос в TG-топик
- [ ] #3 Ответ пользователя (вердикт + опц. wouldRepeat/заметка) пишется в tastings.json через существующий флоу TASK-46
- [ ] #4 После ответа или явного отказа pending закрывается и не достаётся повторно; протухшие (>7 дней) архивируются молча
<!-- AC:END -->
