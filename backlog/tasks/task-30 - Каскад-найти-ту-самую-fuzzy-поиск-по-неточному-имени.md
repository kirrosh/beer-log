---
id: TASK-30
title: 'Каскад «найти ту самую»: fuzzy-поиск по неточному имени'
status: Done
assignee: []
created_date: '2026-06-04 12:00'
updated_date: '2026-06-04'
milestone: 'M4: Поиск на точке'
labels:
  - search
  - venue
dependencies:
  - TASK-29
references:
  - scripts/lib/catalog-matcher.ts
  - vault/strategy/m4-craft-locator.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Подзадача B1 (выбрана первой). «Есть ли сорт X на точке» по НЕточному имени (с банки/из головы):
лексический fuzzy, НЕ вектора. Поверх существующего `catalog-matcher` (алиасы + транслит-нормализация
+ токен-раны, уже 30-65% на магазинах) добавить триграммный/Левенштейн fuzzy (SQLite FTS5 + spellfix1
— встроенно, без отдельной БД). Каскад деградации «лучше грубо, чем никак»:
точный сорт → fuzzy по алиасам → только пивоварня узнана → «вот похожее у этого бренда».
Горячий путь, in-memory/SQLite, без LLM. Область поиска — объединённый пул точки (draft+can/bottle).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 FTS5 индекс по сортам/пивоварням каталога (имя+алиасы+бренд) в bun:sqlite — `ensureCatalogFts` (temp-схема, не раздувает catalog.sqlite). spellfix1 заменён на edit-distance из catalog-core (см. notes)
- [x] #2 Функция поиска с каскадом: exact→fuzzy→brewery→absent→none, scoped по seller точки; возвращает ранжированные кандидаты + уровень уверенности (`buildVenueSearch` в scripts/lib/venue-search.ts)
- [x] #3 Прогон на текущих данных Beer Mug (Гагарина-118, кран): «Jaws Атомная» ✓, опечатка «атомнаая прачечнй» ✓, «бфг»→Bfg ✓; `bun scripts/search-venue.ts --demo`. Метрика: 9/10 непустых полезных ответов (10-й — намеренный мусор-контроль)
<!-- AC:END -->

## Implementation Notes
<!-- SECTION:NOTES:BEGIN -->
Фундамент есть — `catalog-matcher` не с нуля, а расширяем. Деградация повторяет brewery-only fallback матчера. Не тащить вектора — это TASK-36.

**Реализовано (2026-06-04):** `scripts/lib/venue-search.ts` (`buildVenueSearch`, `ensureCatalogFts`) + CLI `scripts/search-venue.ts`.

**Решение spellfix1 → edit-distance:** spellfix1 в bun:sqlite требует нативной сборки расширения (на машине нет, хрупкая зависимость). Edit-distance (`levenshtein`/`nameSimilarity`) уже есть в catalog-core; пул точки — десятки строк, где in-memory Левенштейн быстрее round-trip в SQLite. Итог: FTS5 (встроен) держит каталог-wide индекс для уровня «absent» («есть в каталоге, нет на точке»), edit-distance закрывает опечатки/транслит в пуле. AC#1 «встроенно, без отдельной БД» выполнен по духу.

**Каскад (поле `level`):** exact (норм. имя совпало) → fuzzy (edit-distance/подстрока/токены, инвариант: совпал ≥1 токен ИМЕНИ СОРТА, иначе бренд-запрос) → brewery (узнана пивоварня → её сорта в пуле) → absent (FTS по каталогу) → none. Пул = `price_listings WHERE seller=<venue>` (кран draft + холодильник can/bottle под одним seller).

**Граница:** фонетический транслит («Хефевайцен»≠«Hefeweizen» по буквам) лексический fuzzy не ловит — деградирует в brewery (сорт Hefeweizen первым). spellfix1 тут тоже не помог бы (он по буквам). Глубже — задача векторов (TASK-36).
<!-- SECTION:NOTES:END -->
