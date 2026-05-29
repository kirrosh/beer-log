# Beer Log

Закрытый B2B-каталог/маркетплейс крафтового пива. Discovery-витрина для байеров →
аналитика спроса как платный продукт для пивоварен → единое окно заказа.

Полная стратегия и декомпозиция — в `vault/` (Obsidian-вики). Открой папку `vault`
как vault в Obsidian. Точка входа: `vault/index.md`.

## Структура

- `vault/` — документация/стратегия/исследования как связанные md (паттерн «LLM Wiki» Карпатого).
- `backlog/` — задачи в формате [Backlog.md](https://github.com/MrLesk/Backlog.md).
- `packages/catalog-core` — доменные модели каталога + таксономия стилей.
- `packages/parsers` — фреймворк парсеров + прототип Telegram-парсера.
- `packages/web` — заглушка сайта (bun + TS).
- `AGENTS.md` — схема: как агенты работают с вики, кодом и парсерами.

## Запуск

```bash
bun install
bun run typecheck
bun run parse:tg @pivnoe_delo   # прогнать парсер по одному каналу
bun run parse:tg                # по всем seed-каналам
bun run web                     # заглушка сайта на :3000
```

Бэклог:
```bash
npm i -g backlog.md   # или bun add -g backlog.md
backlog board         # доска задач
backlog task list
```
