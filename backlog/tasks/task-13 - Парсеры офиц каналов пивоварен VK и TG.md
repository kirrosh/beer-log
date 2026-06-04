---
id: task-13
title: 'Парсеры офиц. каналов пивоварен (VK + TG), наведённые на discovery'
status: In Progress
assignee: []
created_date: '2026-05-29'
updated_date: '2026-06-04 11:13'
labels:
  - parser
  - phase-0
  - next
milestone: 'M3: Глубина и надёжность каталога'
dependencies:
  - task-12
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Слой 2 (authoritative, см. vault/product/sourcing-strategy.md). Официальный канал
большинства пивоварен — VK/Telegram, а не уникальный сайт. Добавить VK-парсер
(стена/посты) и наводить TG+VK парсеры на хэндлы, полученные из discovery
(task-12). Это дешевле, чем сотни отдельных парсеров сайтов.
<!-- SECTION:DESCRIPTION:END -->

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
- **2026-06-02 — VK-путь, proof через браузер (Claude in Chrome):** все безаккаунтные
  пути закрыты (m.vk.com→badbrowser, vk.com desktop→unsupported-каркас+login, API
  wall.get→token required, AJAX al_wall→hash+cookie) — см. память `vk-public-paths-closed`.
  Залогиненная браузерная сессия VK читает (стена через JS-сбор `[class*="vkitFeedPostText__root"]`,
  прокрутка догружает). НО ROI как источника СОРТОВ низкий: проверены ponarth/greybrewery —
  стены это блог/анонсы без структурированного ассортимента, чётких имён сортов почти нет,
  маркета нет. **Решение пользователя (2026-06-02): массовый VK-ингест не делаем** (низкий ROI);
  48 VK-only пивоварен остаются blocked до появления токена/лучшего пути; VK — точечно при явных
  тап-листах. VK-парсер остаётся открытым, приоритет low.

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TG-сторона готова: fetch-channels.ts наводится на хэндлы из discovery, ingest сортов в каталог, провенанс на записях (десятки пивоварен заингещены). НЕ сделан VK-парсер — но VK помечен «крайний» источник (Backlog.md), большинство активных каналов в TG. Остаток = VK-парсер, low. Можно дробить: TG-часть фактически Done.

ПЕРЕОСМЫСЛЕНО 2026-06-04: снято с High. TG-сторона сделана. VK-остаток ЗАКРЫТЬ — VK без токена/браузера не читается (memory vk-public-paths-closed, мёртвая дорожка). Рост каталога теперь demand-driven через трек E (меню баров вскрывают недостающие пивоварни: Midnight Project, Plague, Осьминогец…), а не слепой добор всех офиц. каналов.
<!-- SECTION:NOTES:END -->
