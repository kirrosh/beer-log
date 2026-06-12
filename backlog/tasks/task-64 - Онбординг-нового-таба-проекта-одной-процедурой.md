---
id: TASK-64
title: Онбординг нового таба-проекта одной процедурой
status: To Do
assignee: []
created_date: '2026-06-12 09:19'
labels:
  - bot
  - infra
  - dx
milestone: 'M6: Бот-хаб на Mac mini — одна сессия, табы-проекты, расписания'
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Добавление проекта-вкладки (следующие кандидаты: tinvest, ai-podcast) = воспроизводимый чеклист/скилл, а не археология: создать forum-topic, запись в ~/.claude/tg-tabs/registry.json (root, skills[], emoji, liveReply, модельный тир), скиллы проекта, разрешения для бот-сессии (bot-settings allowlist / аналог beerlog CLI), изоляция контекста от других вкладок.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 пошаговая процедура (dok или скилл tab-onboard) покрывает: топик → registry → skills → разрешения → smoke-сообщение
- [ ] #2 registry-схема расширена нужными полями (модельный тир/субагент-дефолты), tab-router их читает
- [ ] #3 процедура прогнана на реальном новом табе (можно совместить с TASK-65)
- [ ] #4 описано, как dev вести в той же сессии/боте без второго тест-бота (один юзер, без гоняния через GitHub)
<!-- AC:END -->
