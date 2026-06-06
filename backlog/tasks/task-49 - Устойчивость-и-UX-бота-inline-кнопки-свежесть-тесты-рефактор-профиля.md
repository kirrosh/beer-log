---
id: TASK-49
title: 'Устойчивость и UX бота: inline-кнопки, свежесть в ответах, тесты горячего пути, рефактор профиля'
status: In Progress
assignee: []
created_date: '2026-06-06 10:00'
labels:
  - bot
  - ux
  - tests
  - refactor
milestone: 'M4: Поиск на точке'
dependencies:
  - TASK-43
  - TASK-44
  - TASK-48
references:
  - scripts/lib/venue-personal.ts
  - scripts/lib/provenance.ts
  - scripts/bot-recommend.ts
  - scripts/bot-profile.ts
  - scripts/ingest-shelf.ts
  - scripts/tg-photo.ts
  - .claude/skills/beer-concierge/SKILL.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Не про объём данных, а про устойчивость и UX — наблюдения, всплывшие при реализации интентов бота
(TASK-43/44/48). Пять рычагов, по убыванию пользы:

1. **Inline-кнопки** — системный потолок UX. Бот трижды упирается в одно: не может дать кнопки
   («Беру»/«Открыть сорт», выбор кандидата при ambiguous-дегустации #5, ✅/✏️/❌ при фото-борде #4,
   карточки топ-5 #43) — сырой Bot API не в allowlist, а собирать `sendMessage` руками запрещено.
   Решение по образцу `tg-photo.ts`: узкий allowlisted `tg-buttons.ts` (sendMessage+inline_keyboard,
   приём callback) → снимает ограничение разом для всех интентов выбора.
2. **Свежесть в ответах** — `provenance.ts` уже считает tier/stale/возраст, но lookup/recommend/nearby
   это не показывают. «Есть на Гагарина» без «данные от <дата>, возможно неактуально» вводит в
   заблуждение (кран ротируется быстро, [[venue-availability-freshness]]). Дёшево — tier готов.
3. **Тесты горячего пути** — 11 детерминированных скриптов бота, 0 автотестов. Матчер путает
   edition-варианты ([[catalog-matcher-edition-variant-falsematch]]) и шарится всеми ингестами.
   Лёгкий `bun test` с фикстурами защитит от тихих регрессий.
4. **Рефактор профиля в lib** — логика профиля вкуса дублируется в `bot-profile.ts` и
   `bot-recommend.ts` (fireStyles/favBreweries дважды, чуть по-разному). Завёлся дрейф — вынести
   `tasteProfile()`/`loadBeerMeta()` в `venue-personal.ts`, пока расхождение маленькое.
5. **Чистка git-шума** — `ingest-shelf` делает `PRAGMA wal_checkpoint + journal_mode=DELETE` даже в
   `DRY=1` → `catalog.sqlite` показывается изменённой после readonly-прогона. В DRY журнал не трогать.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Рефактор: `loadBeerMeta(db, beerIds)` + `tasteProfile(tastings, meta)` в `venue-personal.ts`;
      `bot-recommend.ts` и `bot-profile.ts` переведены на них, дублирование снято, вывод не изменился
      (проверено diff'ом до/после на me/recommend).
- [x] #2 Чистка: `ingest-shelf.ts` в `DRY=1` открывает БД readonly (openDb всегда пишет
      journal_mode=WAL+migrate); checkpoint/journal только при реальной записи. DRY больше не метит БД.
- [x] #3 Свежесть: `freshness(seenAt)` в provenance; `bot-lookup` (whereToFind → ageDays/stale) и
      `bot-recommend` (seenAt/stale на каждой rec) отдают возраст. SKILL: при stale оговариваться у полки.
      (nearby — про venue, не про листинг; свежесть там не показываем.)
- [x] #4 Кнопки: `scripts/tg-buttons.ts` + `beerlog buttons` + allowlist. Поддержаны ДВА типа,
      что реально доходят через плагин: `--reply-buttons` (нажатие→текст агенту, выбор) и `--url-buttons`
      (ссылка/карта). callback_data НЕ поддержан — плагин не передаёт callback_query (как location).
      SKILL: правило кнопок переписано + #5 (выбор кандидата) и #6 (карты) используют их.
- [x] #5 Тесты: `tests/bot.test.ts` + `bun test` (package.json). 11 тестов зелёные: provenance
      (ageDays/freshness/tier), гео (haversine/mapUrl), tasteProfile (fire/good/pass/unknown),
      матчер на реальном каталоге (Атомная Прачечная → Jaws). Read-only, скип матчера без БД.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Порядок: рефактор+чистка (фундамент) → свежесть → inline-кнопки → тесты (последними, на стабильный код).
Inline-кнопки и callback — единственное, что требует сырого Bot API; изолировать в один скрипт
(как `tg-photo.ts`), не растаскивать по агенту. Тесты — read-only по `data/catalog.sqlite` (snapshot),
не плодить writes; матчер-фикстуры взять из известного фоллмэтча (Атомная Прачечная ↛ BFG 8000).
<!-- SECTION:NOTES:END -->
