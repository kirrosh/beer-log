---
id: TASK-48
title: >-
  Интенты бота на имеющихся данных: профиль вкуса, цена/где дешевле, скидки,
  новинки, сравнение
status: Done
assignee: []
created_date: '2026-06-05 12:00'
updated_date: '2026-06-07 08:41'
labels:
  - personal
  - bot
  - ux
milestone: 'M4: Поиск на точке'
dependencies:
  - TASK-46
references:
  - data/personal/tastings.json
  - scripts/lib/venue-personal.ts
  - scripts/bot-lookup.ts
  - scripts/catalog-q.ts
  - scripts/beerlog.ts
  - .claude/skills/beer-concierge/SKILL.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Объединяет «напрашивающиеся» user stories бота — те, что **дёшевы, потому что данные уже лежат**
(каталог 266 пивоварен / 22K сортов / 14K листингов + личный слой `tastings.json`), а не хватает
лишь интента в `beer-concierge/SKILL.md` и максимум одной детерминированной read-команды.

Восемь под-сценариев (нумерация продолжает интенты скилла 1–7):

- **#8 Моя история / профиль вкуса** — «что я пил», «мои огоньки», «сколько IPA выпил»,
  «что брал на Гагарина». Агрегат по `tastings.json`: счётчики по `style.category`, топ
  `descriptors` среди fire/good, список 🔥, `wouldRepeat`, сумма `pricePaid`, разрез по venue.
- **#9 «Стоит ли брать?» по профилю** — вердикт на **непробованный** сорт: насколько он
  попадает в мои вкусы (стиль/ABV/дескрипторы) даже без личной оценки.
- **#10 Подбор запросом** — «хочу кислое до 5%», «что-то тёмное и сладкое». NL → структурный
  фильтр по `style/abv/format` (пересекается с TASK-32, но здесь — в боте, через `beerlog query`).
- **#11 Цена / где дешевле** — «почём Атомная», «где взять подешевле». Уже частично в
  `bot-lookup` (`whereToFind`, `retailPriceFrom`) — довести до явного интента + сортировку по цене.
- **#12 Что подешевело (скидки)** — «есть скидки на крафт?». `price_listings.discounted` +
  `prev_price`. Связано с TASK-9 (история цен как сигнал).
- **#13 Новинки у пивоварни** — «что нового у Jaws». `beers.created_at` / `beer_sources.seen_at`.
- **#14 Сравни A и B** — два сорта рядом (стиль/ABV/IBU + мой вердикт по каждому).
- **#15 Брал тут в прошлый раз?** — повтор по venue из истории (частный срез #8).

**Зачем (Кирилл):** ядро «у полки» (лукап + что взять + лог дегустации, #1/#2/#5) закрыто, но
накопленный личный слой и каталог почти не отдаются обратно. Эти интенты замыкают петлю
**лог → профиль → решение у полки** и кормятся ровно теми данными, что уже есть. Минимум кода —
максимум пользы единственному пользователю.

**Принцип (как в TASK-46):** NL-понимание = агент (`beer-concierge`), детерминизм = скрипт,
доступ к данным — ТОЛЬКО через единый `beerlog` CLI (он в allowlist). НЕ плодить новые сырые
скрипты в обход `beerlog` — сырой `bun -e`/`curl` упрётся в пермишен и бот зависнет.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Новый профайлер `scripts/bot-profile.ts` + команда `beerlog me|profile`: читает
      `tastings.json` (через `venue-personal.ts`), печатает компактный JSON — counts по
      `style.category`, топ `descriptors` (fire/good), список 🔥, `wouldRepeat`-кандидаты,
      сумма/средняя `pricePaid`, разрез по `venue` (для #15). Опц. флаг `--venue <seller>`
      (история на точке) и `--style <cat>`. Read-only, не трогает БД и не пишет в tastings.
- [x] #2 `beerlog` зарегистрирована команда `me` (alias `profile`) → `bot-profile.ts`; добавлена
      в allowlist `bot-permit.ts` и в `help`.
- [x] #3 #11 цена/где дешевле: `bot-lookup` `whereToFind` УЖЕ сортирует точки `priceFrom` по
      возрастанию (после домашнего города; keg/опт исключён) — `bot-lookup.ts:143-147`. Кода не
      потребовалось, зафиксировано в SKILL #11.
- [x] #4 #12/#13/#10 проверено: `beerlog query` (readonly SELECT) покрывает скидки
      (`discounted=1 and prev_price is not null`), новинки (`created_at` desc по brewery_id
      подзапросом) и подбор (`style_category` + `abv<=N`). Готовые SELECT-шаблоны в SKILL с
      РЕАЛЬНЫМИ категориями (`sour-wild` не `sour`, см. ниже).
- [x] #5 `beer-concierge/SKILL.md`: добавлены интенты #8–#15 в «Намерения», блок «Инструменты
      данных» (команда `me`, заметка про сортировку lookup), #7 help, таблица live-стриминга
      (#8–#15 мгновенные). #9/#14 — чистые интенты (профиль + lookup, синтез агентом).
- [~] #6 CLI-smoke прошёл (`beerlog me` / `--venue gagarina` / `--style ipa`; шаблоны скидки/
      новинки/подбор; typecheck чист). **Живой smoke в боте** (отправить запросы #8–#15 в чат) —
      за оператором, требует запущенного `bot.sh`.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Разделение «новый код vs чистый интент» (минимизируем код):**
- *Новый код — только профайлер:* `scripts/bot-profile.ts` (read-only агрегат `tastings.json`).
  Это единственный сценарий, который неудобно покрыть `beerlog query` (tastings в JSON, не в
  SQLite). Покрывает #8 и #15 (через `--venue`); питает #9 (агент берёт профиль и сравнивает).
- *Расширение существующего:* #11 — добавить сортировку `whereToFind` по `priceFrom` в
  `bot-lookup.ts` (lookup уже отдаёт точки и `retailPriceFrom`, нужен только порядок).
- *Чистые интенты (0 кода, только SKILL):* #9 (`beerlog me` + `beerlog lookup` → синтез),
  #10/#12/#13 (`beerlog query` SELECT-шаблоны), #14 (два `beerlog lookup`).

**Переиспользование:** `loadPersonal()`/тип `Tasting` в `scripts/lib/venue-personal.ts` (чтение
уже есть — профайлер только агрегирует). `bot-lookup.ts` для резолва имён в #9/#14 — не дублировать
матчер. `catalog-q.ts` (readonly, мутации режет) — уже умеет всё для #10/#12/#13.

**SELECT-шаблоны для SKILL (зафиксировать дословно, чтобы агент не импровизировал):**
- Скидки: `select b.name, pl.price, pl.prev_price, pl.seller from price_listings pl join beers b
  on b.id=pl.beer_id where pl.discounted=1 order by (pl.prev_price-pl.price) desc limit 15`.
- Новинки пивоварни: `select name, style_name, abv, created_at from beers where brewery_id=
  '<id>' order by created_at desc limit 10` (id берётся из `bot-lookup` пивоварни).
- Подбор: `select name, style_name, abv from beers where style_category='sour' and abv<=5
  and status='validated' limit 20` — категории/диапазон подставляет агент из фразы.
  ⚠️ кириллический `LIKE` регистро-зависим — фильтровать style_category по точному значению.

**Границы скоупа (НЕ тащить сюда, оставить отдельным таскам):**
- Полноценный «топ-5 под меня» с ранжированием доступного на точке — это TASK-43 (профайлер
  отсюда — его половина; можно потом переиспользовать `bot-profile.ts`).
- Гео-радиус «что рядом» — TASK-42 (нет координат).
- Wishlist, проактив-пуши, голос, Untappd-синк — это «бэклог»-слой, не «напрашивающееся».
- Запись чего-либо: задача целиком **read-only** (кроме уже существующего record-tasting).

**Тон/формат ответов:** как в скилле — коротко, бейджи 🔥/👍/👎, 🟢/📦/🔁/✨. Профиль не вываливать
простынёй: 3–5 строк сути (топ-стили, любимые дескрипторы, сколько 🔥, на что тянет).

**Факты из smoke (зафиксировано при реализации 2026-06-05):**
- `style_category` реальные значения: `ipa` (5774), `sour-wild` (5253, = кислые), `unknown` (3485),
  `stout-porter` (3036), `lager` (1605), `pale-ale` (1060), `non-beer` (687), `specialty` (342),
  `belgian` (231), `wheat` (194). ⚠️ для подбора (#10) НЕ `sour`, а `sour-wild`. Зашито в SKILL.
- `abv` заполнен у 21092/22140 (95%) → `abv<=N` рабочий фильтр (NULL сам отсекается сравнением).
- В `price_listings.prev_price` встречается мусор (десятки тыс. ₽ → копеечная цена) — интент #12
  предупреждает агента отсеивать неадекватную дельту.
- `whereToFind` в `bot-lookup` уже отсортирован дешевле-выше → #11 без нового кода.
- Профиль сейчас беден (4 дегустации) — ценность интентов растёт с объёмом, который копит TASK-46.
  `bot-profile.ts` — переиспользуемая половина «топ-5 под меня» (TASK-43).
<!-- SECTION:NOTES:END -->
