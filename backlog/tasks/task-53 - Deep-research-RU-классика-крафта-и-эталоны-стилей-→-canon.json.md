---
id: TASK-53
title: 'Deep-research: RU-классика крафта и эталоны стилей → canon.json'
status: Done
assignee: []
created_date: '2026-06-11 09:48'
updated_date: '2026-06-11 11:01'
labels:
  - personal
  - canon
  - research
milestone: 'M5: Рекомендации, метрики выбора и канон'
dependencies:
  - TASK-52
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Разовый курируемый ресёрч для двух типов канона, где автоматика не работает: ru-classic — знаковые сорта российского крафта (десятки позиций, не сотни — это долгосрочный чеклист пользователя) и style-benchmark — 1–2 доступных в РФ эталона на каждый основной стиль (IPA/NEIPA/DIPA/stout/sour/gose/lager/pilsner/wheat…), по которым стиль правильно понимать. Каждая запись с обоснованием в basis. Матч к beerId каталога; нематченные — кандидаты в discovery (возможно, пивоварни ещё нет в каталоге — это тоже сигнал). Описание майлстоуна: backlog/docs/doc-1.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Список ru-classic: 20–40 знаковых сортов рос. крафтовой сцены с одной фразой-обоснованием каждый, записаны в canon.json с basis=research
- [x] #2 style-benchmark: на каждый основной стиль 1–2 эталона, доступных в РФ-продаже (проверка по нашим листингам где возможно)
- [x] #3 Записи сматчены к beerId каталога; нематченные оформлены списком кандидатов в discovery с указанием пивоварни
- [x] #4 Спорные позиции разрешены ресёрчем, а не вопросом к человеку (правило resolve-disputes-by-research)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Ресёрч 3 параллельными sonnet-субагентами (RU-классика / современные стили / классические стили), веб-верификация. Матчинг к каталогу — скриптом с ручным выбором beerId. Добавлено 52 записи в data/personal/canon.json (basis=research): 27 ru-classic (25 сматчены + 2 discovery), 25 style-benchmark (14 сматчены + 11 импортов-эталонов как discovery). 13 записей с beerId=null = список кандидатов в discovery (AC#3). Дублей beerId с distribution-визитками нет. Исключены противоречивые позиции (Stamm Overhype) по правилу resolve-by-research. Скретч-файлы удалены, canon.json — источник правды.
<!-- SECTION:NOTES:END -->
