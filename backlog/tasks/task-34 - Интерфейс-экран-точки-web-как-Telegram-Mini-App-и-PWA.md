---
id: TASK-34
title: 'Интерфейс: экран точки (web) как Telegram Mini App + PWA, бот-лаунчер'
status: To Do
assignee: []
created_date: '2026-06-04 12:00'
milestone: 'M4: Поиск на точке'
labels:
  - ui
  - telegram
dependencies:
  - TASK-33
references:
  - packages/web
  - vault/strategy/m4-craft-locator.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Трек C. Решение 2026-06-04: один web на существующем SvelteKit (`@beer-log/web`, adapter-static) →
работает И как Telegram Mini App, И как PWA вне TG. Снимает риск доступности TG. Бот тонкий: лаунчер
мини-аппа + приём фото полки + уведомления. Бот-UI с нуля НЕ строим.
Экран точки `/venue/[id]`: поиск (TASK-30) + список кран/холодильник + фильтры (TASK-32) + личные срезы
(TASK-33). Старт — минимальный, без дизайна-конфетки.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Роут `/venue/[id]` в @beer-log/web: пул точки (кран+холодильник), поиск-строка, базовые фильтры
- [ ] #2 Telegram Mini App: WebApp SDK (initData/тема), запуск из бота; бот — лаунчер + приём фото→оцифровка
- [ ] #3 PWA: manifest + работа вне TG (открыть по ссылке / на дом. экран). Один билд обслуживает оба
<!-- AC:END -->

## Implementation Notes
<!-- SECTION:NOTES:BEGIN -->
adapter-static → данные точки предэкспортить в JSON (catalog:export), поиск клиентский для малого объёма; при росте — лёгкий API. У проекта уже есть TG-интеграция (plugin) для бота-лаунчера/приёма фото. Дизайн — позже (frontend-design skill).
<!-- SECTION:NOTES:END -->
