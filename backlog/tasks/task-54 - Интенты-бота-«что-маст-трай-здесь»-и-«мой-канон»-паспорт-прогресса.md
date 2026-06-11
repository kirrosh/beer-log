---
id: TASK-54
title: 'Интенты бота: «что маст-трай здесь» и «мой канон» (паспорт прогресса)'
status: To Do
assignee: []
created_date: '2026-06-11 09:49'
labels:
  - personal
  - canon
  - bot
  - ux
milestone: 'M5: Рекомендации, метрики выбора и канон'
dependencies:
  - TASK-52
references:
  - scripts/bot-recommend.ts
  - .claude/skills/beer-concierge/SKILL.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Главный пользовательский сценарий канона у полки: пересечение canon.json с пулом точки, непробованное вперёд, со статусом «пробовал: 🔥» из tastings.json — интент превращается в «что из канона я закрываю здесь и сейчас». Плюс канон-паспорт: прогресс по типам («RU-классика: 4/23 · эталоны IPA: 2/5 · визитки: 6/266») — превращает «надо больше пробовать» в чеклист. Discover-слот в recommend приоритетно берёт незакрытый канон с точки. Разрезы «что каноничного у <пивоварни>» / «эталонные стауты» — фильтры по canonType+brewery/style с наличием и ценой. Описание майлстоуна: backlog/docs/doc-1.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Команда beerlog must-try --seller <seller>: канон ∩ пул точки, непробованное вперёд, у пробованного — вердикт; JSON с reasons (тип канона + basis)
- [ ] #2 Команда beerlog canon (паспорт): прогресс по canonType и по стилям/пивоварням, счётчики пробовано/всего
- [ ] #3 bot-recommend.ts: discover-ветка приоритетно заполняется незакрытым каноном из пула точки
- [ ] #4 Интенты добавлены в beer-concierge/SKILL.md (формат карточек, обложки), команды в allowlist bot-permit.ts
- [ ] #5 Разрез по пивоварне и по стилю работает без указания точки (по всему каталогу, с пометкой наличия)
<!-- AC:END -->
