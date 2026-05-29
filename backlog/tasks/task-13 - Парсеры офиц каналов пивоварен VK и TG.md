---
id: task-13
title: 'Парсеры офиц. каналов пивоварен (VK + TG), наведённые на discovery'
status: In Progress
assignee: []
created_date: '2026-05-29'
updated_date: '2026-05-29 20:30'
labels:
  - parser
  - phase-0
  - next
milestone: 'M1: Ширина каталога + витрина'
dependencies:
  - task-12
priority: high
---

## Description

Слой 2 (authoritative, см. vault/product/sourcing-strategy.md). Официальный канал
большинства пивоварен — VK/Telegram, а не уникальный сайт. Добавить VK-парсер
(стена/посты) и наводить TG+VK парсеры на хэндлы, полученные из discovery
(task-12). Это дешевле, чем сотни отдельных парсеров сайтов.

## Acceptance Criteria

- [ ] VK-парсер постов (новинки/ассортимент)
- [x] Резолв офиц. хэндлов из ссылок discovery (TG из task-12)
- [ ] Прогон по >= 50 пивоварням, ingest сортов в каталог
- [x] Провенанс источника на каждой записи

## Прогресс

- **2026-05-29:** ингест из 6 офиц. TG-каналов → **28 сортов** в каталог
  (validated, провенанс на канал), стили нормализованы `categorizeStyle`.
  Скрипт `scripts/ingest-brewery-channels.ts`, отчёт `data/brewery-channels-report.md`.
- **Ключевой вывод:** regex-парсер `parseBreweryReleases` (формат Rewort:
  «Алк%/Plato%/IBU») НЕ генерализуется — у каждой пивоварни свой формат поста
  (проверено на 12 каналах). Рабочая схема — **агентное извлечение** (скилл
  craft-enrich): агент читает посты превью `t.me/s/` и достаёт сорт+характеристики.
- **Дрейф:** `@jawsbrewery` и `@hopheadbrewery` дают 0 сообщений через веб-превью
  (медиа-посты / иная разметка) — нужен иной способ (caption-парсинг / VK). См. task-5.
- Осталось: VK-парсер; расширить агентный ингест до ≥50 пивоварен (зависит от
  полноты discovery, task-12).
