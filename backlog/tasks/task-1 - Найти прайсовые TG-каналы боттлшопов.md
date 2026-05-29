---
id: task-1
title: Найти прайсовые TG-каналы боттлшопов и пивоварен
status: To Do
assignee: []
labels: [research, phase-0, parser]
dependencies: []
created_date: 2026-05-29
---

## Description

Стартовый seed (`packages/parsers/src/sources.ts`) — это медиа/индустриальные
каналы, а не прайс-листы. Для Фазы 0 нужны каналы, где регулярно постят наличие,
новинки и цены: боттлшопы, оптовики (HoReCa), сами пивоварни.

## Acceptance Criteria

- [ ] Найдено >= 15 публичных каналов с прайсами/новинками
- [ ] Каждый проверен парсером (beers+listings > 0)
- [ ] Список занесён в `vault/research/telegram-sources.md` и в `sources.ts`
