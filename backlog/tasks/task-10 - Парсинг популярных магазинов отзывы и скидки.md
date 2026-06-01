---
id: task-10
title: Парсинг популярных магазинов — отзывы и скидки как сигнал байеров
status: Done
assignee: []
created_date: '2026-05-29'
updated_date: '2026-06-01 12:53'
labels:
  - parser
  - phase-0
  - catalog
dependencies:
  - task-2
  - task-3
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Замкнуть петлю обратной связи (см. vault/product/mvp.md): сторону спроса
бутстрапим из открытых данных. Найти самые популярные магазины крафта РФ
(craftopt, beerkontora, craftbeer78 и витрины сетей) + их карточки в 2ГИС/Яндекс,
снимать по позициям отзывы/популярность и скидки/уценки во времени. Это пассивная
обратная связь байеров — без интервью.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Список топ-магазинов РФ (онлайн-витрины + карточки 2ГИС/Яндекс)
- [x] #2 Парсер витрин: позиция, цена, скидка/старая цена, наличие
- [x] #3 Сшивка позиций магазинов с сортами каталога (дедуп по slug/алиасам)
- [x] #4 Сигнал во времени: discounted-флаг и дельта цены (связка с task-9)
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Сделано: beerkontora/kraftbeer/pivokom/storebeer/craftbeer78 + TG-бар Ваш Чехов; парсеры витрин (цена/скидка/наличие), сшивка матчером, discounted+дельта через price_snapshots. Реестр магазинов — data/pipeline/shops.json. Добор новых магазинов — текущая работа M2, не эта задача.
<!-- SECTION:FINAL_SUMMARY:END -->
