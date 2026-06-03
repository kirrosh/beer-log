---
id: TASK-21
title: >-
  Провенанс сортов: метки «подтверждён пивоварней» / «в продаже» + проход по
  офиц. каналам для их наполнения
status: In Progress
assignee: []
created_date: '2026-06-01 16:55'
labels:
  - catalog
  - web
  - demand
  - pipeline
milestone: 'M2: Дрейф к реальной пользе'
dependencies:
  - task-20
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Сделать провенанс сорта первоклассным и наблюдаемым. Идея (Кирилл, 2026-06-01): у
каждого сорта — метки, ОТКУДА он подтверждён, по двум независимым наблюдаемым
рыночным сигналам (не рейтинги — это рыночные факты, рамка
`vault/strategy/legal-boundary.md`):

1. **«Подтверждён пивоварней»** — сорт пришёл/виден в ОФИЦ. источнике самой
   пивоварни (её TG / сайт / VK / Untappd-страница). Сигнал: у сорта есть запись в
   `beer_sources` (shop-ингест туда НЕ пишет — только в `price_listings`, проверено).
2. **«В продаже»** — встречается у продавцов (`demand.reach > 0`), с разбивкой
   магазины/бары (уже есть из task-20).

Комбинация даёт уверенность записи и подсвечивает пробел:
- **оба** → полный профиль (варится + доступен) — самый ценный сорт;
- **только пивоварня** → варится, в продаже пока не найден;
- **только магазин** → в продаже, но у пивоварни НЕ подтверждён ⇒ кандидат на
  проверку (это и есть рабочая очередь прохода по каналам, см. ниже).

Вторая половина задачи — **систематический проход по каждой пивоварне**, чтобы метка
«подтверждён пивоварней» была точной: найти её офиц. каналы (TG/сайт/VK) и спарсить
их, провалидировав сорта. Это опирается на СУЩЕСТВУЮЩИЕ скиллы/раннбуки (НЕ
переписываем): `brewery-research` (поиск/верификация источников), `fetch-channels` +
`scripts/ingest-sorts.ts` (TG, `data/ingest/RUNBOOK.md`), `breadth-backfill` (Untappd),
`promote-sorts` (auto→validated). VK-источники — через task-13 (VK-парсер). Метка
«только магазин» из п.3 = приоритизация прохода.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 В экспорте у сорта вычисляются метки: `verifiedByBrewery` (есть офиц. источник в `beer_sources`; вид источника — telegram/website/vk/untappd — по host `source_url`, магазины исключены) + `inShops` (магазины/бары из demand)
- [x] #2 На карточке сорта метки видны и понятны: «✓ варит пивоварня» (с указанием канала) и «в продаже: N точек»; нынешний грубый статус (✓/~) уточнён/заменён этим
- [x] #3 Видна комбинированная уверенность: оба / только пивоварня / только магазин (последнее — явный «у пивоварни не подтверждён»)
- [x] #4 На дашборде (`pipeline-status.ts`) — метрика покрытия: сколько сортов/пивоварен подтверждены офиц. каналом vs только магазин (сейчас ~687 shop-only — рабочая очередь)
- [ ] #5 Проход по пивоварням с shop-only сортами: офиц. каналы найдены (brewery-research) и спарсены (TG/Untappd), auto-сорта промоутнуты (promote-sorts) — метка стала точной. VK — через task-13
- [x] #6 (опц.) Фильтры в каталоге: «✓ пивоварня» (подтверждён офиц. каналом) и «в продаже» — чекбоксы на главной (вкладка «Сорта»), сверены с метой: 17716 verified / 2084 в продаже
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Данные на 2026-06-01 (база факта):** beers 17001 · с офиц. источником (`beer_sources`)
16307 · в магазинах 2067 · И ТО И ТО 1380 · только магазин без офиц. 687.

**Метки выводятся БЕЗ миграции схемы.** `beer_sources(beer_id, source_url, excerpt,
seen_at)` — вид источника определяем по host `source_url` (untappd.com / t.me /
домен сайта / vk.com). `recordListing` пишет только в `price_listings` → «есть строка
в beer_sources» ⟺ подтверждён редакционным/офиц. источником. Если позже понадобится —
добавить колонку `beer_sources.kind`, но для v1 деривация на экспорте достаточна.

**Untappd-страница пивоварни** (`untappd.com/<Brewery>/beer`) считается офиц.
источником пивоварни (её каталог). На метке можно различать «по офиц. каналу (TG/сайт)»
vs «по Untappd», если захотим строже — но это про реестр сортов, не про рейтинги
(их не делаем, task-19/legal-boundary).

**Где трогать:** `scripts/export-catalog.ts` (вычислить метки из beer_sources host +
demand), `packages/web/src/lib/catalog.ts` (типы + хелпер), `routes/beer/[slug]`
(показать метки рядом со стилем/статусом), `scripts/pipeline-status.ts` (метрика
покрытия). Проход — существующие скиллы, новый код там не нужен (кроме VK = task-13).

**Не дублировать** brewery-research / promote-sorts / fetch-channels — задача их
ИСПОЛЬЗУЕТ. Новое здесь: метки (данные+UI), метрика покрытия, и приоритизация прохода
по shop-only сортам.

**Возможный сплит:** если проход (#5) разрастётся, его можно вынести отдельной
операционной задачей; метки (#1-4) шиппятся независимо и сразу полезны.

**Сделано (2026-06-01, data+UI, #1-4):** классификатор host→вид источника вынесен в
`packages/parsers/src/sources.ts` (`sourceChannelOfUrl`, тип `SourceChannel`) —
переиспользуют экспорт и дашборд. Экспорт пишет `beer.channels` + агрегаты
`counts.beersVerifiedByBrewery/beersShopOnly`. В `catalog.ts` — тип + хелперы
`verifiedByBrewery`/`inShops`/`beerConfidence` (`both`/`brewery`/`shop`/`none`) +
`CHANNEL_LABEL`. На карточке (`beer/[slug]`) грубый статус-ячейка ✓/~ заменена блоком
из двух сигналов; для shop-only — явная подсказка «кандидат на проверку каналов».
Дашборд печатает секцию «ПРОВЕНАНС СОРТОВ» (16307 офиц. / 687 shop-only) + топ
пивоварен с shop-only сортами (salden-s 155, selfmade-brewery 104, konix-brewery 82 …)
как приоритет прохода. Цифры сошлись с базой факта (both=1380). svelte-check + build
(пререндер) зелёные.

**Осталось:** #5 — проход по каналам (оперативная работа через скиллы
brewery-research/ingest/promote-sorts по shop-only пивоварням, VK = task-13); #6 (опц.)
— фильтры в каталоге.

**Малый батч #5 (2026-06-01) — диагностический вывод.** Прогнал Untappd-ingest по топ-4
shop-only (4-brewers/odna-tonna/bakunin/panzer): заингещено 1599 сортов, но verified лишь
+6, shop-only НЕ сдвинулся. Эти пивоварни УЖЕ забэкфиллены с Untappd — их shop-only остаток
genuine (коллабы/серии/стор-эксклюзивы, реально нет в офиц. каталоге) ⇒ метка уже корректна.
`upsertBeer` клеит источник только по ТОЧНОМУ slug — варианты имён не совпадают, нужен
fuzzy-дедуп (promote-sorts), а не повторный ingest. **Реальные цели прохода** — пивоварни
с ПРОБЕЛОМ: `untappd-error` (salden-s: 155 shop-only, URL есть, ингест падал) и без
untappd-ссылки (selfmade-brewery, konix-brewery, medovarnya — нужен brewery-research →
ingest). Память: [[shop-only-pass-targets]]. Батч добавил +6 сортов и обновил untappd-
coverage в ingest-hints (эти 4 ~полностью покрыты).

**Батч #5 (2026-06-02 #2) — gap-рукав через research→ingest→promote.** Прошёл по пивоварням
с ПРОБЕЛОМ (нет untappd / untappd-error), как велит [[shop-only-pass-targets]], а не по топу
shop-only. Research-субагенты (sonnet) по 6 целям, затем последовательный ingest и promote.
Итог: **shop-only 627→593 (−34)**, пивоварен с shop-only 48→46, провенанс 19313→19368 (+55).
- **kraft** (Владивосток): research нашёл untappd `kraftbeer_vl` (был только TG/VK) → ingest 19
  сортов; 17 shop-only оказались НЕ её листингами (зефир-конфеты + чужие бренды «Simply Craft»/
  «Bar Ale»/«Rouge de Bruxelles», подвязанные по слову craft) → drop. shop-only 17→0.
- **crazy-brew** (Нижний Тагил): research нашёл untappd `CrazyBrewRU` → ingest 36; exact-slug
  склейка 9→4, promote-merge 4 generic→Simply-Craft-канон + validate 5 эксклюзивов → 0.
- **hops** (Пермь, нано): untappd `/w/hops/299018` = всего 1 сорт; 14 «shop-only» — чужие бренды
  со словом hops (North/True/Yellow Hops) → 8 drop + 6 в needs-review человеку. shop-only 14→6.
- **blocked (метка стала точной = «нет офиц. канала»):** victory-art-brew (defunct, Untappd
  'no longer in business', сайт мёртв, список пуст), xp-brew (defunct + JS-only), sorre
  (французская сидрерия Cidre Sorre — сидр, вне РФ-крафт-скоупа; ошибочная идентификация).
- **Урок:** пивоварни с generic-именем («Kraft», «Hops») аккретят чужие листинги по подстроке
  → их хвост чистится **drop**, не merge. Untappd с `data-bid=0` при HTTP 200 = defunct/JS-пусто
  (victory-art-brew, xp-brew) → blocked, не ingest.

**chibis-brewery merge-проход (2026-06-02 #3).** Первый promote-проход по 76 auto shop-only
против 216 Untappd-канона: **merge 64 + validate 6 + review 6 → shop-only 76→12, общий 593→529
(−64)**. Merge — чистые транслит/вариант-совпадения («Carambolage»→«Карамбуляж», «Raschyot
Moshnosti»→«Расчёт мощности», «Hell Man Flamenco Gose»→«Hell Man: Flamenco»). 6 validate =
genuine shop-эксклюзивы (серия «Пчела принесла», «Птичий короб» — нет в Untappd, остаются
shop-only, метка корректна). 6 review (имя без спецификации хмеля — неясно какой canon-вариант:
«Чибис ИПА», «Sour Bank», «Старая Пигалица»…) → overrides needsReview человеку. Подтвердило:
у крупного уже-заингещенного хвоста ПЕРВЫЙ merge-проход даёт ~84% схлопывания (64/76).

**Топ-5 первых merge-проходов (2026-06-02 #4).** Параллельные promote-субагенты (sonnet) по
untappd-ok пивоварням без прошлого прохода: **tarkos 23→2, white-stone 10→2, dieta 9→2,
magic-mess 9→4, mantra-brewery 9→3** (merge 20/8/5/3/5). + блок medovarnya-tradicii-predkov
(медоварня, мёд — вне скоупа). Итог батча: **shop-only 529→482 (−47)**. Остатки 2–4 = review-
элементы человеку (имя без спецификации хмеля / неоднозначный канон).
- **Грабли apply'я:** субагент может записать `drop` как массив ОБЪЕКТОВ `{slug,reason}` вместо
  строк — `promote-sorts.ts` ждёт `drop: string[]`, на объекте падает `TypeError: Binding
  expected string` (sqlite-биндинг). Перед apply нормализовать: `drop.map(d=>typeof d==="string"?d:d.slug)`.
- **Чужие коллабы → drop:** «Magic Mantra (Mantra/Collaboration with Magic Mess)» под magic-mess =
  пиво пивоварни Mantra, Magic Mess лишь соавтор → drop (не её канон). «Container bucket» (один
  shop-сорт с 15 листингами разных канон-сортов, имя-префикс «ДИЕТА/») → drop, листинги осиротеют.

**Итог сессии по #5 (2026-06-02): shop-only 627→482 (−145).** Рукава: gap-research→ingest
(kraft/crazy-brew/hops +55 канона, 3 блока), merge-проходы (chibis 76→12, tarkos/white-stone/
dieta/magic-mess/mantra). Auto-сорта 289→138 (гигиена каталога).

**Осталось по #5:** топ остатка — уже-пройденные крупные хвосты (salden-s 106, 4-brewers 64,
konix 33, afbrew 22, panzer/odna-tonna 20, selfmade 18): первый проход снят (#1) — остаток
genuine, не churn'ить. Следующие ПЕРВЫЕ проходы (untappd ok, нет promotions/<slug>.json) —
по убыванию из pipeline-status: jaws-brewery (13)*, red-button (12), vasileostrovskaya (12)…
(* проверять prevPass). Гейт review — накопленные needsReview человеку (chibis +6, magic-mess
+4, afbrew +1, по 2 у tarkos/white-stone/dieta/mantra). medovarnya: 17 mead-листингов остаются
shop-only при blocked-пивоварне — кандидат на отдельный drop мёд-сортов.
<!-- SECTION:NOTES:END -->
