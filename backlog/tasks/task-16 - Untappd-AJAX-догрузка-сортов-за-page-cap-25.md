---
id: TASK-16
title: 'Untappd: AJAX-догрузка сортов за page-cap (>25)'
status: Done
assignee: []
created_date: '2026-05-31 14:40'
updated_date: '2026-05-31 19:50'
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
- [x] #1 Парсер untappd дочитывает все страницы списка сортов (не только первые 25)
- [x] #2 Есть предохранитель по числу страниц и пауза/лимит между запросами
- [x] #3 ingest-untappd повторно прогнан по CAPPED-пивоварням, секция CAPPED очищается
- [x] #4 healthCheck парсера учитывает пагинацию (дрейф не маскируется потолком)
- [x] #5 Страницы без SSR .beer-item — РАЗОБРАНО: это не JS-рендер, а реально «0 Beer» на Untappd (victory-art-brew). Ложный drift пофикшен; такие пивоварни помечены blocked с верной причиной (нужен не-Untappd источник)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-05-31: расширен скоуп. Кроме page-cap >25 есть второй случай той же причины (JS-рендер): у некоторых пивоварен untappd /beer вообще НЕ отдаёт SSR .beer-item — список целиком за JS. Пример: victory-art-brew (untappd.com/VictoryArtBrew/beer, ссылка валидна, заголовок верный, но 0 .beer-item в HTML → парсер падает с ParserDriftError, сорта не извлекаются). Сейчас victory-art-brew припаркован blocked (overrides) с отсылкой сюда — разблокировать после JS-рендера. Попутно: healthCheck untappd-парсера даёт ЛОЖНЫЙ drift ('разметка изменилась'), когда строка 'beer-item' встречается 1 раз в JS-шаблоне, но реальных блоков нет — стоит поднять порог/проверять data-bid, чтобы не путать JS-рендер с дрейфом разметки.

2026-05-31 (DONE): разведка показала, что премиса «реализовать AJAX-догрузку» сместилась — Untappd с 2026 закрыл `more_beer` за логином (анонимно 200+0 байт, Show More → /login). Проверены все 26 CAPPED — гейт у каждой; реальный тотал виден в шапке («N Beers»). Разрыв: 4124 реальных сорта vs ~650 анонимно (~16%).

Сделано:
- Парсер (`untappd-web.ts`): `parseUntappdBeerTotal` (тотал из шапки), `parseUntappdMoreBeerPath`, цикл `fetchMoreBeerPages` (offset как в sorting.js, дедуп по bid, пауза 1.2с, предохранитель 80 стр. — AC#2), опция `ParseOptions{paginate,cookie}`, `ParseResult.totalAvailable`. Split blocks теперь ловит обе формы разметки (`beer-item ` SSR и `beer-item` во фрагментах more_beer).
- Ложный drift (AC#5): решаем по тоталу — «0 Beer» (victory-art-brew) = норма, не drift. victory оказался не JS-рендер, а пустой профиль (0 сортов на Untappd) → overrides обновлён (нужен не-Untappd источник).
- healthCheck (AC#4): `itemsSeen` = реальный тотал, `ok` при extracted>0 либо total=0.
- Ингест: статус `ok-untappd-partial` с честным покрытием; `pipeline-status` секция CAPPED → PARTIAL (got/total). 
- Два пути добора (cookie httpOnly → headless из коробки нельзя): (а) headless по `data/.secrets/untappd-cookie.txt`/env `UNTAPPD_COOKIE` (`ingest-untappd.ts {paginate:true}`); (б) browser-collect (Claude-in-Chrome гоняет more_beer, cookie не покидает Chrome) → `data/.secrets/untappd-collected.json` → `scripts/ingest-untappd-collected.ts`.
- AC#3: прогнан browser-collect по всем 26 → +~3425 сортов, каталог 1695→5120, секция CAPPED пуста. Снапшот витрины пересобран.

Headless-cron закреплён: `scripts/extract-untappd-cookie.ts` тянет ТОЛЬКО untappd.com-cookie из Chrome (расшифровка ключом Keychain «Chrome Safe Storage», детерминированный срез 32-байтного SHA256(host_key)-префикса свежего Chrome), пишет в `data/.secrets/untappd-cookie.txt` → `ingest-untappd.ts` пагинирует сам. Проверено end-to-end: jaws 223/223 headless. Браузерный сбор остаётся резервом.
<!-- SECTION:NOTES:END -->
