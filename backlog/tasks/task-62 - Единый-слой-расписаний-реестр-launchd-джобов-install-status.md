---
id: TASK-62
title: 'Единый слой расписаний: реестр launchd-джобов + install/status'
status: To Do
assignee: []
created_date: '2026-06-12 09:19'
labels:
  - ops
  - infra
milestone: 'M6: Бот-хаб на Mac mini — одна сессия, табы-проекты, расписания'
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Все периодические работы системы (пока: pending-ask 12:00 из TASK-55, ночной рестарт сессии из задачи-супервизора; дальше: прогоны tinvest, генерация ai-podcast) — в одном месте: каталог плистов в репо (ops/launchd/) + скрипт install/uninstall/status. Конвенция: джоб НЕ зависит от живости бот-сессии — шлёт напрямую через Bot API / пишет файлы, либо будит сессию обычным сообщением в топик. crontab на macOS закрыт (Operation not permitted) — стандарт = launchd LaunchAgents.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 каталог плистов в репо + скрипт установки/удаления/статуса всех джобов разом
- [ ] #2 com.beerlog.pending-ask (сейчас написан вручную в ~/Library/LaunchAgents) мигрирован в реестр
- [ ] #3 ночной рестарт из задачи-супервизора (TASK-61) заведён в реестре
- [ ] #4 конвенция «джоб не требует живой сессии» записана в dok
- [ ] #5 status показывает: установлен/загружен/последний запуск/лог каждого джоба
<!-- AC:END -->
