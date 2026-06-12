---
name: backlog
description: "Backlog.md CLI — компактный справочник: задачи, AC/DoD, milestones, эпики (parent), docs, decisions, поиск. Use when creating, editing, viewing, or searching tasks or doing any backlog operation in this project."
allowed-tools: Bash, Read, Agent
effort: low
---

# Backlog.md CLI — справочник

**Golden rule:** любые изменения задач/доков — ТОЛЬКО через CLI (`backlog task edit`, `backlog doc update`), никогда не писать в `.md` файлы под `backlog/` напрямую (ломает sync метаданных). Читать файлы можно, писать — нет. При просмотре/листинге всегда `--plain`.

**Делегирование (экономия контекста):** создание задач и объёмные правки (план, notes, final summary) выполняй через субагента `backlog-writer` — передай краткий бриф (суть, AC тезисно, labels/priority/milestone), он оформит по шаблону, выполнит CLI и вернёт только id. Короткие операции (статус, чек AC, назначение) делай сам inline.

## Задачи

| Действие | Команда |
|---|---|
| Создать | `backlog task create "Title" -d "Desc" --ac "AC1" --ac "AC2" [-l a,b] [--priority high] [-m <milestone>] [-p <parent-id>] [--draft]` |
| Просмотр | `backlog task 42 --plain` |
| Список | `backlog task list -s "To Do" --plain` (фильтры: `-a @claude`, `-l label`) |
| Поиск | `backlog search "query" --plain` (`--type task`, `--status "..."`, `--priority high`, `--modified-file src/x.ts`) |
| Взять в работу | `backlog task edit 42 -s "In Progress" -a @claude` |
| Метаданные | `backlog task edit 42 -t "Title" -d "Desc" -l a,b --priority high` |
| План | `backlog task edit 42 --plan "..."` (только после старта работы) |
| Notes | `--notes "..."` (замена) / `--append-notes "..."` (добавить) |
| Final Summary | `--final-summary "..."` / `--append-final-summary "..."` / `--clear-final-summary` |
| AC | добавить `--ac "..."` · чек `--check-ac 1 --check-ac 2` · `--uncheck-ac 2` · `--remove-ac 3` |
| DoD | `--dod "..."` · `--check-dod 1` · `--uncheck-dod 1` · `--remove-dod 2` |
| Зависимости | `--dep task-1 --dep task-2` |
| Ссылки/доки | `--ref src/api.ts` · `--doc docs/spec.md` · `--modified-file src/api.ts` |
| Завершить | `backlog task edit 42 -s Done` — только после всех AC+DoD и Final Summary |
| Архив / в драфт | `backlog task archive 42` / `backlog task demote 42` |
| Драфты | `backlog draft list|create|view|promote|archive` |

Индексы AC/DoD — только повторёнными флагами: `--check-ac 1 --check-ac 2`. Формы `1,2,3` и `1-3` НЕ работают.

## Milestones и эпики

| Действие | Команда |
|---|---|
| Список | `backlog milestone list --plain` (`--show-completed`) |
| Назначить / создать | `backlog task edit 42 -m "Имя"` — milestone создаётся неявно первым назначением (это поле в задаче, имя сверяй точно) |
| Снять | `backlog task edit 42 --clear-milestone` |
| Архивировать | `backlog milestone archive <id|name>` |
| Эпик = родительская задача | подзадачи через `backlog task create "Sub" -p 42`; иерархия видна в `backlog task 42 --plain` |

## Docs и decisions

| Действие | Команда |
|---|---|
| Создать doc | `backlog doc create "Title" [-p guides/setup] [-t guide]` (типы: readme, guide, specification, other) |
| Обновить | `backlog doc update doc-1 --content "..."` (`--title`, `--tags`, `-p` — пути относительно `backlog/docs/`) |
| Список / просмотр | `backlog doc list` / `backlog doc view doc-1` |
| Decision | `backlog decision create "Title"` |

## Multi-line ввод (критично в агентном харнессе)

CLI хранит текст literally — `\n` в кавычках НЕ становится переводом строки. Рабочие формы:

1. Повтор флага по строке: `--append-notes "строка 1" --append-notes "строка 2"`
2. Реальные переводы строк внутри двойных кавычек (один вызов).

НЕ использовать: `$'...'`, `"$(printf ...)"`, heredoc — AST-скринер харнесса их отклоняет (Backlog.md issue #595).

## Phase discipline

- **Создание:** Title, Description, AC, labels/priority. Без Implementation Plan.
- **Работа:** `-s "In Progress" -a @claude` → `--plan` → показать план пользователю и дождаться аппрува → код; `--append-notes` по ходу, `--check-ac` по мере готовности.
- **Завершение:** `--final-summary` (PR-стиль: что/зачем/импакт/тесты/риски) → все AC+DoD чекнуты → `-s Done`.
- Реализуй только то, что в AC. Нужно больше — сначала добавь AC или заведи follow-up. Не ссылайся на будущие task id.

## Типовые проблемы

| Проблема | Решение |
|---|---|
| Task not found | проверь id: `backlog task list --plain` |
| AC не чекается | индексы смотри в `backlog task 42 --plain` |
| Метаданные разъехались | пересохрани через CLI: `backlog task edit 42 -s <текущий статус>` |

Полная справка: `backlog --help`, `backlog <cmd> --help`.
