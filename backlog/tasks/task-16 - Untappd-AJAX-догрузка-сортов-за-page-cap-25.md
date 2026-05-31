---
id: TASK-16
title: 'Untappd: AJAX-догрузка сортов за page-cap (>25)'
status: To Do
assignee: []
created_date: '2026-05-31 14:40'
updated_date: '2026-05-31 15:45'
labels:
  - ingest
  - parser
milestone: 'M1: Ширина каталога + витрина'
dependencies:
  - TASK-13
references:
  - scripts/ingest-untappd.ts
  - packages/parsers/src/untappd/untappd-web.ts
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Untappd-парсер читает только первую страницу списка сортов (~25), дальше контент подгружается AJAX-ом — не реализовано. Сейчас при упоре в потолок ставится статус ok-untappd-capped, такие пивоварни видны в дашборде pipeline-status в секции CAPPED.

На 2026-05-31 в CAPPED 20 пивоварен (brew-barrel, brew-by-crew, ganza-brewery, gas-brew, hobos, panzer-brewery, ravencraft, red-button-brewery, red-cooper, reload-brewery, schwarzkaiser-brewery, telmann, zavod, iohoho и др.) — у каждой реально может быть заметно больше 25 сортов, сейчас недобраны.

Задача: реализовать пагинацию untappd /beer (разведать load-more endpoint / параметр сортировки+страницы), итеративно дочитывать до конца списка, с предохранителем по числу страниц и аккуратным rate-limit (риск дрейфа/бана — парсер хрупкий, бьём по чужому сайту). После — повторно прогнать ingest-untappd по CAPPED-пивоварням.

Контекст: парсер parseUntappdBeerList/untappdWebParser в packages/parsers/src/untappd/untappd-web.ts (PAGE_CAP=25 в scripts/ingest-untappd.ts). Решение отложить пагинацию принято 2026-05-31 (выбран трекинг вместо реализации).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Парсер untappd дочитывает все страницы списка сортов (не только первые 25)
- [ ] #2 Есть предохранитель по числу страниц и пауза/лимит между запросами
- [ ] #3 ingest-untappd повторно прогнан по CAPPED-пивоварням, секция CAPPED очищается
- [ ] #4 healthCheck парсера учитывает пагинацию (дрейф не маскируется потолком)
- [ ] #5 Страницы без SSR .beer-item (полный JS-рендер, напр. victory-art-brew) тоже извлекаются (headless/AJAX endpoint), а не только пагинация за 25
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-05-31: расширен скоуп. Кроме page-cap >25 есть второй случай той же причины (JS-рендер): у некоторых пивоварен untappd /beer вообще НЕ отдаёт SSR .beer-item — список целиком за JS. Пример: victory-art-brew (untappd.com/VictoryArtBrew/beer, ссылка валидна, заголовок верный, но 0 .beer-item в HTML → парсер падает с ParserDriftError, сорта не извлекаются). Сейчас victory-art-brew припаркован blocked (overrides) с отсылкой сюда — разблокировать после JS-рендера. Попутно: healthCheck untappd-парсера даёт ЛОЖНЫЙ drift ('разметка изменилась'), когда строка 'beer-item' встречается 1 раз в JS-шаблоне, но реальных блоков нет — стоит поднять порог/проверять data-bid, чтобы не путать JS-рендер с дрейфом разметки.
<!-- SECTION:NOTES:END -->
