# Beer Log

Закрытый B2B-каталог/маркетплейс крафтового пива. Discovery-витрина для байеров →
аналитика спроса как платный продукт для пивоварен → единое окно заказа.

> Данные каталога (результаты парсинга магазинов, Telegram-каналов и Untappd) в публичный репозиторий не входят — здесь код конвейера, агентные скиллы и документация. Сборка витрины требует собственного `catalog.json`.

Полная стратегия и декомпозиция — в `vault/` (Obsidian-вики). Открой папку `vault`
как vault в Obsidian. Точка входа: `vault/index.md`.

## Структура

- `vault/` — документация/стратегия/исследования как связанные md (паттерн «LLM Wiki» Карпатого).
- `backlog/` — задачи в формате [Backlog.md](https://github.com/MrLesk/Backlog.md).
- `packages/catalog-core` — доменные модели каталога + таксономия стилей.
- `packages/parsers` — фреймворк парсеров + прототип Telegram-парсера.
- `packages/web` — витрина-справочник (SvelteKit + Svelte 5, статичная сборка).
- `AGENTS.md` — схема: как агенты работают с вики, кодом и парсерами.

## Запуск

```bash
bun install
bun run typecheck
bun run parse:tg @pivnoe_delo   # прогнать парсер по одному каналу
bun run parse:tg                # по всем seed-каналам
bun run catalog:export          # catalog.sqlite → JSON-снапшот для витрины
bun run web                     # витрина (dev) на :3000
bun run web:build               # экспорт + статичная сборка витрины (packages/web/build)
```

Бэклог:
```bash
npm i -g backlog.md   # или bun add -g backlog.md
backlog board         # доска задач
backlog task list
```
