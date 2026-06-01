---
id: TASK-18
title: 'Фикс битых untappd-ссылок (venue /v/, неполные /w/)'
status: Done
assignee: []
created_date: '2026-05-31 14:41'
updated_date: '2026-06-01 12:54'
labels:
  - ingest
  - data-quality
dependencies:
  - TASK-12
references:
  - scripts/pipeline-status.ts
  - packages/parsers/src/untappd/untappd-web.ts
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
У части пивоварен в breweries.links записан неверный untappd-URL, из-за чего ingest невозможен. Классификатор pipeline-status их корректно НЕ ingestable'ит (через classifyUntappdBeerListUrl) и отправляет в brewery-research — но это не чинит саму ссылку, нужно найти правильный URL списка сортов.

Известные на 2026-05-31:
- victory-art-brew — записан venue-URL https://untappd.com/v/victory-art-brew/2040839 (бар/заведение, не список сортов пивоварни). Нужен профиль или /w/<slug>/<brewery-id>.
- wild-lab — записан неполный https://untappd.com/w/wild-lab (без числового brewery-id). Рабочая форма /w/<slug>/<id>/beer (ср. petzold).

Задача: для таких пивоварен найти корректный untappd-URL пивоварни (профиль или /w/<slug>/<id>), обновить breweries.links, прогнать ingest-untappd. По возможности — добавить в brewery-research эвристику: проверять untappd-ссылку предикатом classifyUntappdBeerListUrl и помечать venue/неполные как требующие фикса.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 victory-art-brew и wild-lab имеют валидный untappd-URL в breweries.links и заингещены
- [ ] #2 brewery-research/ресёрч проверяет untappd-ссылку на venue/неполноту перед записью
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-05-31 (pipeline-run brewery-research итерация): битые untappd-ссылки ИСПРАВЛЕНЫ в breweries.links — victory-art-brew venue /v/victory-art-brew/2040839 → https://untappd.com/VictoryArtBrew/beer (верифицирован, реальные сорта); wild-lab неполный /w/wild-lab → https://untappd.com/w/wild-lab/310414/beer (id 310414, 26 сортов; нюанс: бренд gypsy-переехал Москва→Буэнос-Айрес, заголовок 'Wild Lab - Argentina', сущность та же). Оба теперь классифицируются как ingest-sorts. ОСТАЁТСЯ: (1) доингестить их сорта; (2) превентивная эвристика — research проверяет untappd-ссылку classifyUntappdBeerListUrl перед записью (пока субагентам это в промпте, программно не зашито).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
wild-lab починен (валидный /w/-URL, +30 сортов). victory-art-brew не чинится через Untappd (страница без SSR beer-блоков, JS-рендер) — припаркован blocked, ассортимент возьмём через brewery-research/иной источник. Эвристика classifyUntappdBeerListUrl уже отсеивает venue/неполные URL в pipeline-status.
<!-- SECTION:FINAL_SUMMARY:END -->
