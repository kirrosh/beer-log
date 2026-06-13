---
id: TASK-66
title: 'DB-гигиена: убрать catalog.sqlite из git, снапшот-бэкапы + чистка истории'
status: To Do
assignee: []
created_date: '2026-06-13 08:28'
updated_date: '2026-06-13 08:55'
labels:
  - infra
  - data
  - ops
milestone: 'M6: Бот-хаб на Mac mini — одна сессия, табы-проекты, расписания'
dependencies:
  - TASK-62
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
catalog.sqlite (~20МБ) трекается в git → история раздулась до ~350МБ (+~20МБ за коммит, где БД менялась), бьёт по размеру репо и по скорости агентских worktree (изоляция параллельной работы клонирует всю историю). Бинарная БД — данные-of-record (накопленная курация: promote-sorts, разобранные human-review, провенанс), НЕ дешёвый build-артефакт → цель: надёжно не потерять + удобный откат, но НЕ через git-историю. Контекст переезда и раскладки — memory bot-hub-mac-mini-vision; снапшот-механизм у проекта уже зачат в scripts/backup-db.ts + backups/. Связь с persistence-снапшотами (TASK-51) — там временной ряд price_snapshots, тут бэкап файла БД, не путать.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 catalog.sqlite в .gitignore, вперёд git трекает только код + текстовые данные (бэклог, JSON-экспорты, конфиги)
- [x] #2 Разовая чистка истории: catalog.sqlite вырезан из всей git-истории (git filter-repo --path ... --invert-paths или аналог), репо схлопнут до единиц МБ; зафиксировано, что хеши переписаны (локальный личный репо — ок)
- [ ] #3 Снапшот-механизм: VACUUM INTO + gzip (консистентная копия даже при живой БД, ~3-5МБ), имя с таймстампом, откат = распаковать поверх; расширяет существующий scripts/backup-db.ts
- [ ] #4 Автоснапшот перед ингестом/миграцией (hook в pipeline-run / ингест-скриптах) + ежедневный по расписанию через ops-слой launchd (TASK-62); ротация: последние N + еженедельные
- [ ] #5 Снапшоты хранятся ВНЕ код-репо (напр. ~/assistant/.data-backups/), опц. зеркало на внешний диск/облако (переживает смерть SSD)
- [ ] #6 (опц., follow-up по решению) построчные diff'ы каталога через периодический sqlite3 .dump (текст) в отдельном маленьком data-репо — отметить как опциональное, не блокирует
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Сделано при переезде на ~/assistant (2026-06-13): catalog.sqlite в .gitignore (AC #1); история очищена git-filter-repo (--path data/catalog.sqlite --path telegram-tabs --invert-paths) — .git 385МБ→6МБ, 192 коммита, хеши переписаны (личный локальный репо, ок) (AC #2). БД (20МБ) лежит в рабочем дереве, не трекается. Остаток (AC #3-5): снапшот-механизм VACUUM INTO+gzip, расписание через ops-слой (TASK-62), хранение вне репо.
<!-- SECTION:NOTES:END -->
