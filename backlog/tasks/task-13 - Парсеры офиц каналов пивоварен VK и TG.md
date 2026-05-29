---
id: task-13
title: Парсеры офиц. каналов пивоварен (VK + TG), наведённые на discovery
status: To Do
assignee: []
labels: [parser, phase-0, next]
dependencies: [task-12]
created_date: 2026-05-29
---

## Description

Слой 2 (authoritative, см. vault/product/sourcing-strategy.md). Официальный канал
большинства пивоварен — VK/Telegram, а не уникальный сайт. Добавить VK-парсер
(стена/посты) и наводить TG+VK парсеры на хэндлы, полученные из discovery
(task-12). Это дешевле, чем сотни отдельных парсеров сайтов.

## Acceptance Criteria

- [ ] VK-парсер постов (новинки/ассортимент)
- [ ] Резолв офиц. хэндлов из ссылок discovery
- [ ] Прогон по >= 50 пивоварням, ingest сортов в каталог
- [ ] Провенанс источника на каждой записи
