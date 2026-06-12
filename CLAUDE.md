## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

<!-- BACKLOG.MD GUIDELINES START -->
# Backlog.md — управление задачами

Задачи, доки и решения проекта ведутся через **Backlog.md CLI** (`backlog`). Файлы задач —
`backlog/tasks/task-<id> - <title>.md`; доки — `backlog/docs/`, решения — `backlog/decisions/`.
Исторический обзор фокуса/майлстоунов (M1–M4) — `backlog doc view doc-2`.

**🎯 Golden rule:** любые изменения задач — только `backlog task edit`. **НИКОГДА не редактируй
`.md` файлы задач напрямую** — это ломает sync метаданных, Git-трекинг и связи. Читать файлы
можно, писать — нет. То же для доков/решений: `backlog doc …`, не ad-hoc записи файлов.

### Делегирование оформления (экономия контекста)

Создание задач и объёмные правки текста (план, notes, final summary) выполняй через субагента
**`backlog-writer`** (sonnet, `.claude/agents/backlog-writer.md`): передай краткий бриф (суть,
AC тезисно, labels/priority/milestone) — он оформит по шаблону, выполнит CLI и вернёт только id.
Короткие операции делай сам inline:
- просмотр/список/поиск: `backlog task <id> --plain` · `backlog task list -s "To Do" --plain` ·
  `backlog search "<q>" --plain`
- взять в работу: `backlog task edit <id> -s "In Progress" -a @claude`
- чек AC/DoD: `--check-ac <n>` · `--check-dod <n>` (флаги повторяются: `--check-ac 1 --check-ac 2`;
  формы `1,2,3`/`1-3` не работают)
- завершить: `backlog task edit <id> -s Done` — только после всех AC+DoD и Final Summary.

### Phase discipline

- **Создание:** Title, Description, AC, labels/priority. Без Implementation Plan.
- **Работа:** In Progress + назначить себя → `--plan` → **показать план пользователю и дождаться
  аппрува до кода** → `--append-notes` по ходу, `--check-ac` по мере готовности.
- **Завершение:** `--final-summary` (PR-стиль: что/зачем/импакт/тесты/риски) → все AC/DoD → Done.
- Реализуй только то, что в AC. Нужно больше — сначала добавь AC или заведи follow-up.
  Не ссылайся на будущие task id.

### Справка

Компактный справочник CLI (все команды: tasks, AC/DoD, milestones, docs, decisions, поиск) — скилл
**`backlog`**; полный гайд по оформлению задач живёт в субагенте `backlog-writer`,
не в основном контексте.

### Multi-line ввод (агентный харнесс)

CLI хранит текст literally — `\n` в кавычках НЕ становится переводом строки. Используй повтор
`--append-*` флага по строке или реальные переводы строк внутри кавычек. Не использовать
`$'...'`, `"$(printf ...)"`, heredoc — AST-скринер харнесса их отклоняет (Backlog.md issue #595).
<!-- BACKLOG.MD GUIDELINES END -->

