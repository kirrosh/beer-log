# Log

Хронология работы над вики. Префикс строки: `## [YYYY-MM-DD] <тип> | <тема>`.
Парсится юникс-тулзами: `grep "^## \[" log.md | tail -5`.

## [2026-06-04] strategy | Рамка проекта: пет-проект для личной пользы (не бизнес)
После запроса «объективная критика — зачем проект, где выстрелим» разобрали кейс против (Untappd-
инкумбент решает много для разных акторов; ров доступности наполовину заёмный — трек E харвестит
Untappd-меню; рынок −16,7%; B2B-платёж не подтверждён; ст.21 над «где купить»). Решение Кирилла:
**дефолтный вектор = пет-проект, максимизирующий ЕГО личную пользу** (юзер №1, forcing function) —
строим до максимума нужного ему функционала, пока не упрёмся в стену или не станет реально полезно.
Бизнес/продукт — опциональный следующий шаг, в голове, не текущая цель. Не донимать бизнес-критикой
при каждом решении. Оптика оценки путей развития: «что максимизирует пользу у полки», не защищённость.
Ближайшая веха пользы = M4 MVP, юзабельный в его баре (gate = пул точки + TASK-34 интерфейс); трек E
скоупить с баров, куда он ходит (НН: Игра/Hophead имеют Untappd-меню по зонду). Зафиксировано в memory
`pet-project-personal-utility-frame`. Вайл-доки (drift-to-value/positioning) уже совместимы (Кирилл =
user #1, монетизация later) — стратегию не переписывали, добавлена рамка приоритизации.

## [2026-06-04] demand | Разведзонд Untappd venue-меню + эпик трека E (TASK-37..40)
Не гадали — написали зонд `scripts/recon-untappd-venues.ts` (BFS по nearby от Google-сидов, парс
SSR-HTML без cookie/VPN, матч пивоварен к каталогу). Прогон 19 венью Москвы/СПб/НН: **63% с бизнес-
меню**, **4379 priced-рёбер** с 12 точек (со срезом-датой), боттлшопы с полным прайсом (Пиво и Пена
1200, TBPBar 694). Match-rate флор 24% — занижен; калибровка по LIKE: matched верны, но Midnight
Project / Plague / Осьминогец / Заповедник / Gravity / Godbeerg = **0 в каталоге** → меню вскрывают
реальные дыры предложения (из 386 «новых» — импорт/сидр/мид вне канона + настоящий RU-крафт). Вывод:
массовый парсинг RF-бар-меню даёт граф+цены+мету+discovery одним источником. **Заведён трек E в M4**
(одобрено Кириллом): TASK-37 E1 дискавери венью+детект меню → TASK-38 E2 парсер всех секций →
TASK-39 E3 матч+скоуп-фильтр (unmatched RU-крафт → brewery-research/promote-sorts) → TASK-40 E4
ингест в граф (цены/формат/freshness, краны by-pour отдельно от unit). Правки: `Backlog.md` (трек E +
4 строки), `strategy/m4-craft-locator.md` (§ревизия: числа зонда + ссылки на задачи). Tier-A меню
делают трек A (фото-vision, TASK-31) фолбэком для Tier-B. Зонд-скрипт оставлен как сид ингеста.

## [2026-06-04] strategy | Untappd-ревизия — расслоённый источник точки, не конкурент
Триггер: Кирилл заметил живую RF-активность в Untappd → переосмыслить позиционирование на M4.
Не гадали — сходили в браузер (без VPN, egress не РФ). Факты: активность скромная и убывающая,
но **расслоённая**. Tier A (топ-бары) ведут ПОЛНОЕ Untappd-for-Business меню: Братья Крафт (Москва,
venue 3943033) — 244 пива, секция `Bottles & Cans` (`?menu_id=6159`, срез датирован до часа) =
**оцифрованный самим баром холодильник** с пивоварней/стилем/ABV/IBU/рейтингом/форматом(Can/Bottle)/
объёмом/ценой ₽, машиночитаемо; пивоварни листа = ровно наш каталог. Tier B (Эрик Рыжий, НН) — меню
нет, только органический поток чек-инов патронов (~1–2/день, жив после блока 25.04), каждый = датир.
ребро доступности с форматом. **Опровергнуто:** memory `untappd-venue-not-demand-source` (генерализация
«RF-бары не ведут бизнес-меню» — верна для хвоста, не для топа) и TASK-31 («холодильник из веба
недостижим» — для Tier A достижим, структурно и свежее наших данных). **Решения (Кирилл):** якорь M4 —
хардкор крафт-ядро + импорт оценок из Untappd (засев личного слоя, не рейтинг-сеть); Untappd = источник/
апстрим, не конкурент; ров на доступности+локальности+моменте (переживёт возврат Untappd). Правки:
`entities/untappd.md` (переписан: расслоение, апстрим/импорт, отличия), `strategy/m4-craft-locator.md`
(§ревизия: трек A получает быструю полосу «Untappd-меню→ingest-shelf» для Tier A, vision = фолбэк Tier B;
скоуп уточнён — импорт оценок да, рейтинг-сеть нет), memory `untappd-venue-not-demand-source` (коррекция
+ tier-нюанс в «как применять»). Кода не трогали — стратегическое осмысление. Следующее (не сделано):
оформить «Untappd-меню → ingest-shelf» fast-lane как задачу трека A; импорт Untappd-оценок в личный слой.

## [2026-06-02] catalog | task-28 — demand-driven расширение канона (закрыта)
#1: `scripts/unmatched-brands.ts` (`demand:candidates`) агрегирует unmatched-листинги
по бренду с частотой+охватом, matcher отсекает канон-промахи. #2: alias-fix канона
(Red Button/Chibis/Black Cat, −370 unmatched) + завод топ-9 новых (brewery-research
субагентами → upsertBrewery → ingest-untappd 1594 сорта): White Stone, Magic Mess,
Big Pot, BAD Brew, Tarkos, Atmosphere, Red Rocket, Mantra, Dieta. #3: отсев импорта/
не-пива (Lapochka=лимонады отсеяна). Каталог 238→247 пивоварен, +1666 сортов.

## [2026-06-02] research | task-13 — VK-путь проверен, массовый ингест свёрнут
Все безаккаунтные VK-пути закрыты (m.vk badbrowser / vk.com desktop unsupported / API
token-required / AJAX hash+cookie). Залогиненный браузер (Claude in Chrome) VK читает,
но стены ponarth/greybrewery — блог/анонсы без структурированного ассортимента, ROI как
источника сортов низкий. Решение: массовый VK-ингест не делаем, 48 VK-only остаются
blocked. Память: vk-public-paths-closed. VK-парсер (task-13) — open/low.

## [2026-06-02] catalog | task-21 #5 — разбор human-review ресёрчем (11 пивоварен)
Спорные shop-only auto-сорта 11 крупных пивоварен (salden-s, 4-brewers, afbrew,
panzer, odna-tonna, rewort, zagovor, ganza, gusi, big-village, on-the-bones) разобраны
ресёрчем (Untappd/гугл) — 4 субагента promote-sorts на sonnet. 21 auto → 1: ~16 merge
(усечённые магазинные имена → подтверждённый канон), 3 validate (ApfelWein, Symbiotica
Apple, It's Over 9000), 1 drop (luna-park). human-review гейт 11→1 (остался afbrew
Symbiotica Perry — неразрешим без этикетки), shop-only 423→406, план разблокирован.
Также ранее: task-11 закрыт (/meta дайджест + гейт PRIVATE), task-22 закрыт (#5 через
task-23), task-21 #6 (фильтры каталога «✓ пивоварня»/«в продаже»).

## [2026-06-01] infra | task-23 — единый shop-ingest по платформе (proof контракта ресёрчеров)
Diff: bespoke-скрипт-на-магазин (5 шт) заменён единым движком, параметризованным платформой.
Чистые парсеры по платформе → @beer-log/parsers (shops/platforms.ts): parseWoocommerce/
parseBitrixCatalog/parseStorebeerPage/parseTelegramTapList + общие decodeEntities/
parseVolumeMl/NONBEER/looksLikeBeerLine + тип ShopItem. Движок scripts/lib/shop-ingest.ts:
сеть+пагинация (адаптеры-генераторы со своей пагинацией+стоп) + общий пайплайн matcher→
recordListing→stats/примеры (DRY, PAGES-override, глоб. дедуп по extId). CLI ingest-shop-
platform.ts <id|--all> читает shops.json.ingestConfig. Магазин = конфиг, не скрипт.
Регресс DRY (все страницы) сверён с живой БД: kraftbeer 295=295, pivokom 1770=1770,
vashchehov 148=148 (точно); storebeer 1941 vs 1947 (±6: шире NONBEER+дрейф); rusbeershop
8797 = первый скан (раньше не сканировался). 5 bespoke удалены, ссылки в доках на движок.
typecheck чист. beerkontora (by-collection InSales) остаётся отдельным ingest-shop.ts.
Закрывает task-23 (= task-22 #5, proof shop-ресёрчера «в бою»).

## [2026-06-01] product | task-22 — контракт «ресёрчеров» по сущностям (консолидация #1-4)
Diff: тулинг, разложенный по СТАДИЯМ, формализован в сущностные бандлы-«ресёрчеры» без
переписывания рабочего конвейера. Новая страница [[entity-researchers]]: контракт
(глаголы жизненного цикла discover→source→ingest→match→validate→refresh→report-stage,
конвенция per-instance state, model-тиринг haiku/sonnet/opus, гейты), декларация
«владеемых действий» очереди (один action → один ресёрчер-владелец), манифесты 4 бандлов
(brewery / sort / shop / city-как-scope-юнит: какой skill, какие скрипты, какой раннбук,
какие data-файлы) и таблица пробелов→под-задач. Главный пробел — bespoke-ingest на
каждый магазин (7 шт) → под-задача единого shop-ingest по платформе (TASK-23 = #5,
proof контракта); плюс brewery-refresh (TASK-24), shop-recurring (TASK-25). Вписано в
[[operating-pipeline]] и `AGENTS.md`, индекс обновлён. Спайн оркестрации
(pipeline-status --plan → pipeline-run) НЕ тронут. Закрывает AC#1-4 TASK-22; #5 — TASK-23.

## [2026-05-29] init | Каркас проекта
Заложен каркас: bun-монорепо (`catalog-core`, `parsers`, `web`), Obsidian-вики
по паттерну Карпатого, бэклог в Backlog.md, прототип Telegram-парсера.
Исходный GTM зафайлен в `raw/`. Создано ядро страниц вики.

## [2026-05-29] ingest | Ресёрч конкурентов и TG-источников
Веб-поиск: существующие «каталоги» крафта в РФ — это розничные/оптовые витрины
магазинов (craftopt, beerkontora, craftbeer78, wbtraditions, russiancraftbeer),
а не B2B discovery-аггрегаторы. Подтверждает пустоту ниши. Найдены стартовые
TG-каналы (медиа, не прайсы). См. [[competitors]], [[telegram-sources]].

## [2026-05-29] query | Честный анализ: нужен ли новый каталог
Стресс-тест посылки. Находка: «пустой ниши» нет. РусБир (rus-beer.ru) — уже
работающий B2B-маркетплейс пива (Москва+МО, импорт/мейнстрим); russiancraftbeer.ru
— работающий реестр крафта РФ; taplist.ru сломался после блокировки Untappd.
Рынок пива −16,7% в 2025, независимый крафт под прессом. Вердикт: «каталог» как
самоцель не нужен; defensible только нейтральный слой по независимому крафту +
аналитика спроса, и только после валидации спроса/готовности платить. Создана
страница [[need-and-demand]]; поправлен [[competitors]].

## [2026-05-29] ingest | Формат «магазин+бар» и отзывы владельцев
Гипотеза о росте гибрида боттлшоп+бар подтверждается. Экономика: магазин навынос
(наценка 50-100%) + бар (до 200%), без сезонности, дешевле центрового бара,
районная модель. «Ваш Чехов» (НН) — 5+ точек, растёт. Цитаты владельцев (Соколов,
СПб): «не успеваю за новинками отрасли» (discovery-боль), «тара даёт простор»,
сдвиг к району, «изучайте спрос». Кейсы провалов (Биркофф −3 млн, Гатчина) —
исполнительский риск. Для проекта: усиливает гипотезу discovery Фазы 0, но байеры
не платят (выручка — с пивоварен за аналитику). Создана [[hybrid-shop-bar]].

## [2026-05-29] ingest | Подход build-first + скидки как сигнал
Кирилл: код сейчас дешевле интервью → строить MVP, а не выяснять «надо ли».
Согласен с уточнением: Фаза-0-агрегатор и есть инструмент валидации; переносим
проверку из интервью в инструментированный продукт (метрики discovery + тест
готовности платить как фича). Дешёвый код не удешевляет дистрибуцию/готовность
платить/доверие — главный риск «построить ненужное и спутать со стройкой».
Наблюдение о частых скидках в «Ваш Чехов» → скидки/уценки как пассивный сигнал
спроса (что не продаётся), читается из данных без интервью. Создан [[approach]],
дополнен [[data-model]], задача task-9.

## [2026-05-29] decision | Финализирован концепт MVP
Кирилл сформулировал суть: продукт — петля обратной связи пивоварни⇄байеры,
которой сейчас нет (каталог = субстрат). Сторону спроса бутстрапим пассивно из
открытых данных популярных магазинов: отзывы (что берут) + скидки (что не
продаётся) — без интервью. Переписан [[mvp]] под финальный концепт + mermaid-петля;
заведена task-10 (парсинг магазинов). Оговорки: отзывы — шумный потребительский
прокси; рыночные риски ([[need-and-demand]]) в силе; прибыль не на старте ([[approach]]).

## [2026-05-29] ingest | Аналоги петли в других сферах/странах
Проверка концепта петли по аналогам. Валидация формы: Provi+SevenFifty (США,
discovery+заказы+аналитика Pulse), BeerBoard (США, продаёт пивоварням данные о
проливе — платят Diageo/BrewDog), Sellar (UK, нейтральный craft B2B без комиссии),
Fragrantica/Basenotes (long-tail ниша, данные сообщества → бренды). Критика:
дезинтермедиация (утечка 60-80% при транзакц. модели), мультихоминг/слабая
эксклюзивность, «каталог≠сетевой эффект», relationship-driven закупка, 67%
провалов на supply-стороне. Уроки подтверждают наши выборы (аналитика>транзакции,
нейтральность, single-player discovery, бутстрап скрейпингом). Перенос на РФ:
форма работает, но не переносит размер (рынок −16,7%, TAM мал). Создан
[[analogs-and-lessons]].

## [2026-05-29] decision | Рассматриваем ресёрч-режим вместо продукта
Кирилл: делать не как продукт, а как ресёрч-проект с доступом к информации.
Вердикт: умный де-риск (снимает готовность платить и cold-start; самый юр-защищённый
формат). MVP облегчается: убираем paywall/аккаунты/транзакции/UX; ядро (парсеры +
каталог + дедуп + провенанс + сигнал спроса) остаётся; добавляем методологию и
лёгкий слой публикации (отчёты/датасет из LLM-wiki). Юр-рамка: держать выход
агрегированным или с ограниченным доступом. Дверь в продукт открыта. Создан
[[mvp-research-mode]].

## [2026-05-29] decision | Доступ открытый + формат «Dotabuff RF-крафта»
Кирилл: доступ открытый; идея — глобальный рейтинг/каталог в стиле Dotabuff/
mmorpg.org, часть аналитики прятать, делать контент и пользоваться самому. Вердикт:
формат reference+meta+content берём; «глобально + рейтинг как Untappd» — нет
(Untappd победил, RateBeer закрылся 01.02.2025; нет дата-рва; публичный потреб.
рейтинг алко из РФ = юр-тупик). Делаем «мету» из наблюдаемых сигналов (что варят/
в наличии/тренды/цены-скидки), не user-оценки. Цель: открытый справочник RF-крафта
+ мета, глубокая аналитика под замком; seed — Open Brewery DB + парсеры. Создан
[[reference-site]], решена развилка доступа в [[mvp-research-mode]], task-11.

## [2026-05-29] ingest | Open Brewery DB по РФ = 0
Проверено по API: by_country=russia → total 0, список пуст. Всего в Open Brewery DB
9 559 пивоварен (в осн. США/Европа/Корея/ЮАР/Австралия; по СНГ — 1 запись в
Днепропетровской обл.). База brewery-level, без сортов/наличия/цен. Вывод: сид по
РФ делаем сами (парсеры + russiancraftbeer.ru + списки магазинов). Это не минус —
это и есть причина существования проекта: каноничный RF-крафт-датасет соберём
только мы. Обновлены [[reference-site]] и task-11.

## [2026-05-29] build | Пакет @beer-log/store (хранилище каталога)
Реализован store на bun:sqlite: схема (breweries/beers/sources/beer_sources/
price_listings/price_snapshots), upsert с дедупом по slug+алиасам, идемпотентный
ingest ParseResult, детект скидок по истории цен. Сид-парсер russiancraftbeer
(/export): пивоварни из /brewery/-ссылок + строк ассортимента на карточках +
заведения /place/. Раннер scripts/build-catalog.ts (сид rcb + ингест TG). Тесты
(офлайн) и typecheck зелёные: дедуп, идемпотентность, скидки, сид. task-3 → Done.

## [2026-05-29] build | Реальный сбор данных: russiancraftbeer → catalog.sqlite
Через web-fetch собран /export russiancraftbeer, прогнан parseRcbExport офлайн,
засеян store. Результат: 20 пивоварен (ссылки + строки ассортимента заведений),
5 сортов с категоризацией стиля (Gose→sour-wild, International IPA→ipa, Patersbier/
Fruit Beer→unknown), 14 заведений распознано. Записаны data/catalog.sqlite и
data/catalog-report.md. Прим.: /export — частичная витрина (≈10 заведений + «новое»);
полный обход реестра + TG-каналы запускаются на машине через scripts/build-catalog.ts
(в песочнице сеть/скрейпинг закрыты политикой). Цен в источнике нет — сигнал скидок
появится из TG/магазинов.

## [2026-05-29] build | Петля по Rewort + база знаний о сборе
Собрана демо-петля на пивоварне Rewort (Сергиев Посад). Supply: офиц. сайт —
лендинг, каталог сортов в VK/Untappd (подтверждает «офиц. канал = VK»). Demand:
2 рабочих магазина — craftbeer78 (СПб, 23 поз., цены+остатки) и winestyle (Мск, 27
поз., цены+ABV+цвет). В БД: 50 сортов/50 листингов. Кросс-магазин: Regatta 269₽ в
обоих; «Крылья отваги»≈«Kryly Advagi» — транслит-совпадение → нужен fuzzy (task-14).
craftopt лежит, greatbeer/beeribo на JS — хрупкость источников. Создан
[[data-acquisition-log]] (как/откуда собираем, покрытие, дыры). Файлы:
data/rewort-catalog.sqlite, data/rewort-loop-report.md.

## [2026-05-29] build | Первоисточник Rewort (TG) + fuzzy-дедуп + обогащение
Добрались до первоисточника: офиц. TG-канал @RewortBrewery даёт в каждом релизе
имя/стиль/ABV/Plato/IBU/описание — богаче магазинов и VK. Написан парсер релизов
(parseBreweryReleases) + fuzzy-матч (isSameBeer/normalizeName в catalog-core, через
транслит slug + Левенштейн). Обогащение: 7 сортов Rewort = характеристики из TG +
цены из магазинов (fuzzy + алиасы), статус validated, теги/описание/ссылки.
«Крылья отваги»(TG/cb78)↔«Kryly Advagi»(winestyle) fuzzy не поймал (0.83<0.85) —
сматчено ручным алиасом (рабочая схема task-14). Файлы: data/rewort-enriched.*,
отчёт. Это агентное обогащение «сырьё→адекватные записи» (позже — скилл).

## [2026-05-29] build | Скилл craft-enrich (обогащение каталога)
Собран скилл обогащения: SKILL.md (Telegram-first; VK — крайний случай; конвейер
парс релиза→стиль→теги→ссылки→цены→дедуп→статус), references/source-formats.md,
scripts/enrich.ts (обобщённый конвейер на @beer-log/*), evals/evals.json (3 кейса).
Упакован в skills/craft-enrich.skill. Эталон применения — scripts/enrich-rewort.ts.

## [2026-05-29] discovery | Топ-16 крафтовых пивоварен РФ + офиц. ссылки (task-12)
Наполнили Discovery-слой: 16 топовых рос. крафт-пивоварен с верифицированными
офиц. ссылками (сайт + Telegram + VK/Untappd). Данные проверены ресёрчем по вебу
(превью t.me/s/<handle> + офсайты) — хэндлы не выдумывались: где офиц. TG не
подтверждён (Victory Art Brew, Plan B, 1516, Lighthouse), поле пусто. 12 из 16 с
подтверждённым офиц. Telegram → база для ингеста сортов (task-13). В store добавлена
колонка breweries.links (SourceRef[] JSON) + слияние в upsertBrewery (+slug-override,
канонизация имени). Каталог: 20→27 пивоварен (9 обогащено на месте, 7 новых).
Отброшены как неподтверждённые/закрытые: Mad Brewlab, Brick Stone, Wylde Brew, ДНК.
Файлы: scripts/seed-top-breweries.ts, data/top-breweries-report.md, data/catalog.sqlite.

## [2026-05-29] ingest | 28 сортов из офиц. TG-каналов пивоварен (task-13)
Наполнили authoritative-слой: 28 сортов из 6 офиц. Telegram-каналов (AF Brew,
Brewlok, Selfmade, Salden's, Zagovor, Big Village) → каталог 5→33 сорта, статус
validated, провенанс на канал, стили по `categorizeStyle`. Ключевой вывод: regex
`parseBreweryReleases` (формат Rewort) НЕ генерализуется — у каждой пивоварни свой
формат поста (проверено на 12 каналах). Рабочая схема — агентное извлечение из
превью `t.me/s/` (скилл craft-enrich). Дрейф: @jawsbrewery, @hopheadbrewery дают 0
текст. сообщений (медиа-посты) — нужен caption/VK. Файлы: scripts/ingest-brewery-channels.ts,
data/brewery-channels-report.md.

## [2026-05-29] build | Витрина-справочник v1 (task-11)
Собрана тонкая открытая витрина «Dotabuff российского крафта»: SvelteKit + Svelte 5
(runes) + Vite, запуск Bun, статичная сборка (adapter-static). Данные — JSON-снапшот
(scripts/export-catalog.ts из catalog.sqlite, БД в рантайме нет). Экраны: главная
(мета-полоса: пивоварни/сорта/города/стили + цветной stacked-бар распределения по
стилям; фильтры: поиск/категории-chip/город/ABV/verified/офиц-TG; вкладки Сорта|
Пивоварни), /beer/<slug>, /brewery/<slug>. Эстетика — тёмный «терминал», цвет=
категория стиля, кириллица-шрифты (Saira Condensed/Golos Text/JetBrains Mono). Без
потребительских рейтингов (рыночные данные, ст. 21). Проверено в браузере: главная,
страница пивоварни (Salden's), страница сорта (Violent Twins), клиентская навигация.
Грабли по пути: paths.relative+trailingSlash ломали динамические импорты на вложенных
маршрутах → перешёл на абсолютные пути и чистую статику без SPA-fallback. Команды:
bun run web / web:build. UX-спека: [[reference-site-ux]]. Связано: [[reference-site]].

## [2026-05-29] discovery | +40 активных пивоварен (батч по регионам, task-12)
Расширили базу: discovery-батч из 4 агентов по регионам (Мск/МО, СПб/СЗ,
Урал/Сибирь/ДВ, Юг/Поволжье) — 40 НОВЫХ активных пивоварен с офиц. ссылками,
верификация активности по свежим постам/чек-инам 2025-26 (хэндлы проверены, не
выдуманы). Каталог 28→68 пивоварен, 14→38 городов; витрина обновлена. Реестр
russiancraftbeer как источник отпал (export сломан → HTML); магазины без чистого
индекса брендов — поэтому discovery исполняем агентно (устойчиво). Файлы:
data/discovery/batch-2026-05-29.json, scripts/seed-breweries.ts (переиспользуемый).
Также слит эталонный Rewort в каталог (был в отдельной БД). Заведена task-15
(офиц. изображения, отложено). Дальше: ещё батчи к ≥200 + сорта/цены по новым.

## [2026-05-29] ingest | Вглубь: ~280 сортов из 25 каналов + ingest-hints (task-13)
Глубокий проход по офиц. каналам: 28 пивоварен с TG, 25 отдали посты (2 страницы
превью t.me/s через ?before — захватили историю шире). 6 агентов извлекли релизы →
274 сорта заингещено, каталог 40→280 сортов (дедуп по уже собранным). Дрейф (0 текст.
сообщений): @jawsbrewery, @hopheadbrewery, @petzold_brewpub — нужен caption/VK.
Главное для будущих проходов: заведены **хинты** data/ingest-hints.json — по каждой
пивоварне канал/метод/дата/newestId/oldestId/sortsIngested/status. Следующий проход
читает newestId и берёт только посты новее → инкрементальное обновление. Источник-
данные сохранены: data/ingest/sorts-2026-05-29/g*.json. Скрипт scripts/ingest-sorts.ts.

## [2026-05-29] ingest | Дрейф-каналы решены через Untappd: +75 сортов (task-13)
Инкрементальный проход по TG дал 0 новых постов (та же дата — норма, петля исправна).
Разобрался с тремя дрейф-каналами (@jawsbrewery/@hopheadbrewery/@petzold_brewpub):
их веб-превью t.me/s закрыто целиком — отдаёт визитку, не ленту (embed постов тоже
закрыт), так что caption-парсить нечего. Решение — параллельный источник **Untappd**:
публичные страницы пивоварни /beer отдают структурированный список (имя/стиль/ABV/IBU/
описание) на raw-fetch (HTTP 200). Новый парсер untappdWebParser/parseUntappdBeerList
(packages/parsers/src/untappd/) + scripts/ingest-untappd.ts (мэппинг slug→URL в MAP,
идемпотентный апсерт, аддитивный блок `untappd` в хинтах). По 25 сортов на пивоварню
(упёрлись в первую страницу Untappd — AJAX-догрузка остатка не реализована, статус
ok-untappd-capped). Каталог 280→355 сортов. ingest-sorts.ts доработан: мержит хинты,
не затирая блок untappd. Дальше: расширять MAP для ~40 пивоварен без TG.

## [2026-05-29] ingest | Demand-слой: beerkontora 700 листингов, петля замкнулась (task-10)
Запустили слой спроса (магазины) — по mvp.md это ядро продукта (петля supply↔demand).
beerkontora.ru на InSales server-рендерит каталог → парсится обычным fetch. Парсер
parseInsalesProducts/shopTitleToBeerName (packages/parsers/src/shops/) + scripts/ingest-shop.ts.
Идём по коллекциям ПИВОВАРЕН (/collection/<handle>) — пивоварня известна → дедуп чистый
(isSameBeer по обеим половинам заголовка рус/eng — канон бывает и рус. из TG, и англ. из
Untappd). 700 листингов по 8 пивоварням (карта SHOP.map, 14 наших ∩ beerkontora; 6 пустые),
33 склеены с каноном, 682 снапшота цен (price_snapshots → детект скидок при повторе во
времени; recordListing уже это делал), наличие захвачено (Jaws 67/70 нет в наличии = сигнал).
Магазин — ВТОРИЧНЫЙ источник: несвязанные листинги beerId=null (ассортимент/цена без
засорения канона); авто-создание сортов отвергли (мусор: кросс-листинги BrewDog, комбуча,
транслит). Петля замкнулась end-to-end: сорта Jaws с Untappd → их листинги из магазина
склеились. export-catalog несёт beer.demand={listings,sellers,discounted}; 28 сортов с
сигналом. Нюанс: цены beerkontora оптовые за упаковку (packQty). Дальше: повтор во времени,
/collection/all для discovery, ещё магазины (craftbeer78 per-unit), промоушн листингов в канон.

## [2026-05-30] ingest | Полный скан beerkontora: +4 пивоварни, +641 сорт, 3648 листингов (task-10/12)
Прогнали /collection/all beerkontora для прироста каталога. Магазин ~85% импорт, поэтому
агентная классификация 174 коллекций → 26 росс. крафт (data/discovery/beerkontora-ru-craft.json);
в канон заводим ТОЛЬКО росс. крафт, импорт — листингами. Скрипт scripts/ingest-shop-full.ts,
2 фазы: A — коллекции росс. крафта (апсерт пивоварни лениво + создание сортов status auto +
листинги), B — /collection/all пагинацией (импорт листингами beerId=null). Итог: breweries
68→72 (+Василеостровская, Dream Team, Sergacore, Sorre), beers 355→996 (+641 auto), listings
707→3648 (857 РФ + 2784 импорт), сортов со спрос-сигналом 28→676. Анти-мусор: сорт создаём
только если в заголовке алиас именно этой пивоварни (≥4 симв.) → режет кросс-листинги; не-пиво
(сидр/тоник/комбуча) и объём (20л/0.33) фильтруются; пивоварня лениво (только при товаре);
ретрай фетча (ZlibError). Итерации очистки shopTitleToBeerName: срез brewery-токенов
(Beer/Brewery/Pivovarnya), Unicode-граница объёма (\b не ловит кириллицу 'л'), NONBEER по
исходному заголовку. Остаточный шум ~3/641 + транслит-имена (beerkontora латиницей) —
чистка/промоушн auto→validated отдельным проходом. catalog.json несёт beer.demand.

## [2026-05-30] build | Операционный конвейер: трекинг + скиллы + промоушн auto→validated
Заложил полу-автономный конвейер (vault/product/operating-pipeline.md). Сущности
(пивоварня/магазин/город) идут по стадиям; состояние ВЫВОДИТСЯ scripts/pipeline-status.ts
(дашборд + очередь действий) из БД+ingest-hints+links, руками — только
data/pipeline/overrides.json (валидация/блокеры/needsReview). Чеклисты не ведём вручную —
вычисляются. Агентные шаги — 3 скилла .claude/skills/: brewery-research (источники),
promote-sorts (auto→validated), shop-discovery (магазины). Применитель решений промоушна —
scripts/promote-sorts.ts (validate/merge/drop/review, листинги/провенанс сохраняются).
Прогнал промоушн на 3 пивоварнях (агент по скиллу): jaws/konix/gletcher → validated 350→458,
9 слияний транслит-дублей, drop минералки, 10 спорных в needsReview. Дашборд: 72 пивоварни
(12 discovered/29 sourced/12 ingested/19 validated), очередь — ingest-sorts 29, demand 18,
brewery-research 15, promote-sorts 6, human-review 3. Дальше: пройти очередь скиллами;
позже скилл pipeline-run (оркестратор), реестр магазинов shops.json, города/заявки/СНГ.

## [2026-05-30] build | Скилл-оркестратор pipeline-run + демо-виток промоушна
Собрал оркестратор конвейера (.claude/skills/pipeline-run): читает приоритизированный план
(scripts/pipeline-status.ts --plan → JSON {plan,gates}), берёт топ-группу, диспетчит батчами
параллельными субагентами нужный скилл (promote-sorts/brewery-research/shop-discovery) или
ingest-скрипт, применяет результат, рефрешит дашборд. Бюджеты: ≤5 субагентов, ≤10 сущностей/
запуск; гейты (human-review/blocked) и скоуп (новый город/страна) — не трогает, отдаёт человеку.
Добавил режим --plan в pipeline-status (приоритет promote→ingest→research→demand).
Демо-виток: топ-группа promote-sorts (6 пивоварен) → 2 субагента ×3 → validate 434/merge 2/
drop 6 (зельтцеры/газировка)/review 10. Итог: validated 458→892, auto 523→81 (остаток —
только спорные в human-review, 8 пивоварен). Группа promote-sorts очищена, следующий
приоритет плана — ingest-sorts (29). Дальше: пройти ingest/research оркестратором; разобрать
human-review (гейт человека); shops.json + demand по городам.

## [2026-05-31] ingest | pipeline-run sweep — ingest-sorts batch 1 (Untappd ×7 + blocked ×3)
Оркестратор pipeline-run (sweep): топ-группа плана — ingest-sorts (29). Обработал первый
батч ≤10. Источник untappd.com есть у 7 → добавил в MAP scripts/ingest-untappd.ts
(profile-URL из breweries.links → +/beer) и запустил: brew-barrel, brew-by-crew,
brew-garage-78, brewmen, burning-brewery, credo-brewery, craft-band — +167 сортов
(validated). 5 из 7 упёрлись в page-cap 25 (возможна AJAX-догрузка). Без читаемого
источника (нет untappd.com и нет TG): 1516-brewery (untappd-линк ведёт на your.beer-зеркало),
brauerei-ponarth, crazy-brew (website+vk) — помечены blocked в overrides, не выдумывал.
Дашборд: ingested 11 / validated 27 / blocked 3; очередь ingest-sorts 29→19. Субагентов не
порождал (Agent tool недоступен) — ingest-sorts детерминирован, делал сам. Дальше: остаток
ingest-sorts (19), brewery-research (15); гейт human-review — 8 пивоварен (не трогаю).

- 2026-05-31 ingest-sorts batch 2 (pipeline-run, чистый код): Untappd ×15 из breweries.links, +340 сортов (validated). Очередь ingest-sorts 16→1. 20 пивоварен в CAPPED (untappd >25, нужна дозагрузка).

- 2026-05-31 TG-ветка hmelnoe-podvore (pipeline-run): полный back-read канала @hmelnoe_podvorye → извлечён ассортимент (7 сортов, validated). Очередь ingest-sorts опустела (1→0). Попутно укреплены ingest-sorts.ts (не клобберит sortsIngested при частичном проходе) и fetch-channels.ts (full back-scan для never-ingested каналов, иначе застревают за newestId).

- 2026-05-31 brewery-research батч ×10 (pipeline-run, итерация): 5 параллельных субагентов ×2 волны, ресёрч без записи в БД → применил последовательно. Найдены источники (Untappd у всех 9, TG у chibis/dwarf/dream-team), проставлены города. Очередь brewery-research 18→8, в ingest-sorts +8, promote-sorts +1 (dream-team, 17 auto). 50-ottenkov-sinego → blocked (закрыта). Города: Омск, Уфа, Москва, НН, Липецк, Кострома, Краснодар, СПб.

- 2026-05-31 ingest-sorts батч ×8 (pipeline-run, итерация): Untappd-ингест найденных ресёрчем источников (URL из links, MAP не трогал), +178 сортов (validated). 1984-brewing-co 23, barinoff 24, chibis 25*, dwarf 25*, heartly 25*, los-pivnos 25*, lovecraft 25*, osiris 6 (*=page-cap, в CAPPED). Очередь ingest-sorts 8→0. validated 42→51.

- 2026-05-31 brewery-research батч ×8 (pipeline-run, итерация): очередь research опустела (8→0). Sourced: papa-s-hobby, sergacore, vasileostrovskaya (Untappd 167 сортов!), + ИСПРАВЛЕНЫ битые untappd task-18: victory-art-brew (venue→/VictoryArtBrew/beer), wild-lab (неполный→/w/wild-lab/310414/beer). Blocked ×3: sorre (фр. сидрерия, не РФ), updraft-brewery (RU не существует), dnk-brewery (закрыта с 2023).

- 2026-05-31 ingest-sorts ×3 (pipeline-run, итерация): papa-s-hobby 5, wild-lab 25 (validated, +30 сортов). victory-art-brew УПАЛ — untappd-страница без SSR beer-блоков (JS-рендер), парсер 0; припаркован blocked→task-16.

- 2026-05-31 promote-sorts ×3 (pipeline-run, итерация): 3 субагента сверили auto-сорта с Untappd-эталоном → промоушн. dream-team V12/M3/R2, sergacore V14 (рыбная серия → рус. имена, Sour-Smoothie), vasileostrovskaya V29/M1. Итого validated 55, merged 4, review 2 (→human-review). auto 81→22. ПЛАН ПУСТ — supply-цикл (research→ingest→promote) вычищен; остались только гейты (human-review 9, blocked 8) и demand (магазины городов, scope человека).

## [2026-05-31] ingest | task-16: Untappd-пагинация за логин-гейтом → +3425 сортов
Разведка: Untappd с 2026 закрыл AJAX `more_beer` за логином (анонимно 200+0 байт, Show More → /login) — премиса задачи сместилась. Все 26 CAPPED-пивоварен за гейтом; реальный тотал виден в шапке («N Beers»): 4124 сорта vs ~650 анонимно. Парсер: тотал из шапки, авторизованная пагинация (offset как в sorting.js, дедуп, пауза, предохранитель), фикс ложного drift (victory-art-brew = реально «0 Beer», не JS-рендер). Cookie сессии httpOnly → headless из коробки нельзя; добор сделан browser-collect'ом (Claude-in-Chrome гоняет more_beer, cookie не покидает Chrome) → JSON → `ingest-untappd-collected.ts`. Каталог 1695→5120 сортов, секция CAPPED закрыта. Дашборд: CAPPED→PARTIAL (честное покрытие got/total). См. `data/ingest/RUNBOOK.md`.

- 2026-06-01 promote-sorts батч ×9 (pipeline-run, 3 субагента ×3): auto→validated по 4-brewers/afbrew/alaska/big-village/brewlok/brewmen/burning/coven/ganza. Merge 67 транслит-дублей (Coven по песням, АФ Брю-серия, brewlok-тома), drop 5 (хард-зельтцеры/перри AF Brew), validate чистых. Очередь promote-sorts 29→20, auto 588→514, validated-пивоварен 134→137, сортов 17079→17012 (схлоп дублей). 14 спорных → human-review (generic-имена «Pilsner/Party Hop», таро-серия 4brewers, неузнанные SKU). Следующий приоритет — остаток promote-sorts (20).

- 2026-06-01 sweep продолжение — promote-sorts батч 3 + ingest-sorts разбор (pipeline-run). Промоушн ×10 (paradox/plan-b/sabotage/salden-s/selfmade/velka-morava/zagovor/avgustin/bakunin/volkovskaya): validate 274, merge 44, drop 10 — очередь promote-sorts 12→2 (panzer/vasileostrovskaya: остаток в human-review). ingest-sorts (4: harvest/monkfish/spaceman/hod-konem) — диагностика 5 субагентами (вкл. greybrewery research): у ВСЕХ Untappd = «0 Beer»/«no longer in business», TG-хэндлы = личные контакт-карточки (не каналы), VK не парсится → верифицированно blocked (не слепо). blocked 67→72, sourced→0. ИТОГ sweep: auto 588→178, validated-сортов 16308→16696, validated-пивоварен 134→140, supply-план БЕЗ ГЕЙТОВ пуст. Остаток — гейты: human-review 24 (спорные имена), demand 130 (нужны магазины/города = скоуп человека).

## [2026-06-01] human-review | Гейт спорных сортов разобран целиком (155→0)
Прошли весь гейт human-review (155 позиций по 25 пивоварням). Метод: стратегию/скоуп
спрашивали у Кирилла (интерактивно), спорные сорта разрешали ВЕБ-РЕСЁРЧЕМ субагентами
(Untappd/leolsbeer/craftbeer78/beerkontora/pivokom/BeerAdvocate), не вопросами — по явному
указанию Кирилла (memory resolve-disputes-by-research). Итог: validate ~90, merge ~50,
drop ~25. Стратегия: безалкогольное пиво — В СКОУПЕ (positioning.md), Б/А-сорта валидируем
(«(Б/А)»); сидр/зельтцер/лимонад (Bakunin Botanicals «Ягоды и Ёлки») — listings-only, drop из
канона. Дропы-мисматчи: Verhaeghe Vichtenaar (бельг.), Van Steenberge Augustijn (avgustin),
Desitka Svetle Vycepni (чеш. импорт у konix), Амнезия (hophead-сорт у brewmen). Инструмент
scripts/resolve-review.ts (validate/merge/drop + пересборка needsReview из promotions, дедуп
по slug); решения по раундам — data/pipeline/review-rounds/*.json. Дашборд: validated-пивоварен
140→164, auto-сортов 159→40, needsReview 0. Остаток supply: promote-sorts 2 (panzer/
vasileostrovskaya, обычные auto, не гейт), demand 133 (нужны магазины/города = скоуп).

## [2026-06-01] demand | Новый магазин storebeer.ru: +1947 листингов (СПб)
Diff: разобраны два уже-discovered магазина под demand-парсинг (rusbeershop + storebeer),
субагентами на sonnet (по скиллу shop-discovery). storebeer.ru (СПб, custom-движок) залит
ЖИВЬЁМ: нашёлся встроенный JSON API `/catalog/json_get_items?page=N` (надёжнее HTML-скрейпа),
формат name=«СОРТ (ПИВОВАРНЯ) объём% [тип]». 98 стр × ~20 = 1947 товаров → 1947 листингов,
602 сорт-матч (30.9%) + 211 только-пивоварня; auto-сортов добавилось скромно (isSameBeer
схлопнул объём/формат-варианты — total auto 40→203). Не узнано 1134 = импорт (3 Fonteinen/
Kees/Fuller) + РФ-пивоварни вне канона. Скрипт scripts/ingest-storebeer.ts (каркас от pivokom:
buildMatcher + recordListing, скидки detect через discount_price/markdown_price). Дашборд:
магазинов с листингами +1 (storebeer 1947/760 связано), promote-sorts queue 2→25 (новые auto
у 4-brewers/afbrew/alaska/brewlok/brewmen… — штатная курация). rusbeershop ПРИДЕРЖАН по решению
Кирилла: DRY дал 8782 товара (russkiy_kraft 8660 + rossiyskoe 122), 1161 сорт-матч + 3578
только-пивоварня → в live createAuto раздул бы канон тысячами auto-сортов; скрипт готов
(scripts/ingest-rusbeershop.ts), но live не запускали. Магазины wbtraditions(SPA)/beershopkzn/
craftbeer78/leolsbeer — по-прежнему discovered/blocked.

## [2026-06-01] product | Витрина «Топ» по дистрибуции + магазин Ваш Чехов (НН, blocked)
Diff: первая фича-польза от demand-данных — страница /top «Топ российского крафта» по ШИРИНЕ
ДИСТРИБУЦИИ (в скольких магазинах встречается сорт/пивоварня). Решение Кирилла: популярность =
дистрибуция (рейтингов/чек-инов Untappd в БД нет — тянули только названия; «новизна» по
created_at невалидна — там даты парсинга). export-catalog.ts расширен: по сорту demand.reach
(число магазинов) + диапазон РОЗНИЧНЫХ цен (опт kraftbeer.ru исключён из цены, но в reach
входит); по пивоварне агрегат {reach, listings, listedBeers}. catalog.ts: типы BeerDemand/
BreweryDemand + хелперы topBeersByReach/topBreweriesByReach/dealsBeers. Роут routes/top/ (3
вкладки: Сорта/Пивоварни/Со скидкой), навигация Каталог/Топ в шапке layout. Топ сейчас плоский
(потолок 4 магазина — просканировано ~5), растёт с каждым магазином. Цена — только «от Xруб»
(розничный max грязный: кеги/мультипак). Побочно: export теперь отсеивает мусорные авто-сорта
(пустой slug / имя ≤1 симв., напр. name="),"  — артефакты парсинга заголовков; ломали пререндер
/beer/<пусто>) — 7 шт.; чистка канона в БД отдельной курацией. Vite build+prerender зелёный.
Магазин «Ваш Чехов» (НН) — РЕСЁРЧ субагентом: это сеть крафт-БАРОВ (разливное, draft-only,
7+ точек, Instagram @chekhov_nn), онлайн-каталога с бутылками/ценами НЕТ (Tilda-визитка) →
заведён в shops.json как blocked (no-online-catalog), листингов не дал. Город НН в реестре
магазинов отмечен, но в каталоге пока не появится (города там — из breweries.city).

## [2026-06-01] demand | Новый паттерн: бар → TG-тап-лист. Ваш Чехов (НН) +148 листингов
Diff: разблокировали целый сегмент — разливные БАРЫ без веб-каталога (всё в их POS) публикуют
ассортимент «что на кранах» в Telegram. Это публичный листинг, просто источник = канал, не сайт.
Ваш Чехов (НН, blocked→scanned): канал @chekhov_nn публичный (t.me/s открыт), постит тап-листы
«📍ЛОКАЦИЯ\n[Пивоварня] [Сорт]» (по сорту в строке, ~180 поз/пост по 7 точкам сети, раз в
1-2 нед) — подтвердил субагент-разведчик. Скрипт scripts/ingest-vashchehov.ts: переиспользует
parseChannelHtml (t.me/s веб-превью, тот же механизм что у пивоварен), строки после 📍 →
buildMatcher (он сам делит «Big Village Morning Ritual» на пивоварню+сорт) → recordListing
format=draft, цены НЕТ (в постах нет). Дедуп по строке (сорт повторяется по точкам), фильтр
looksLikeBeerLine отсекает промо-строки. Скан: 149 уник.поз → 149 листингов (148 в дашборде),
47 сорт-матч (31.5%) + 20 пивоварня (→ +20 auto в live createAuto, beers 16981→17001). Не узнано
82 = росс. крафт ВНЕ канона (Big Pot/Chibis/Dieta/Midnight Project/Pivot Point/Red Button/Duble/
White Stone) + импорт — тап-лист заодно = discovery новых пивоварен. ИТОГ для топа: 6-й→7-й
продавец, потолок reach в /top вырос 4→5 (Jaws Lager/Santa Muerte/Weizen теперь в 5 точках вкл.
бар). Первые данные по Нижнему Новгороду. Паттерн обобщаем: ingest-vashchehov.ts — шаблон для
любого разливного бара с публичным TG. Vite build зелёный. NB: алиас-гэпы матчера («Hop Head»
vs HopHead, «Black Cat» — известные пивоварни не сматчились) — кандидат на тюнинг алиасов.

## [2026-06-01] decision | task-19 закрыта — первичная аудитория M2
Diff: развязан анкор-узел M2 (для кого мы). РЕШЕНИЕ Кирилла из трёх кандидатов:
**первичная аудитория = конечный пользователь (энтузиаст крафта) в режиме discovery,
через линзу «где найти».** Обоснование: только её обслуживает ров (граф доступности
сорт↔магазины/бары), доступ к выходу уже открыт, Кирилл = пользователь №1 (forcing
function), стоимость ≈ 0. Пивоварни (B2B-аналитика) = дверь монетизации потом
(готовность платить в рынке −16,7% — непроверенный риск); байеры = вторичны + воронка
онбординга. Юр-рамка: блок «Где найти» (продавцы+цена «от»+разлив/бутылка+дата) держим
ОТКРЫТЫМ как нейтральную рыночную информацию о доступности (не «купи здесь», не промо
точки; прецедент russiancraftbeer.ru) — принят расчётный риск ст.21 под этой рамкой.
Рейтинги Untappd НЕ делаем: Untappd = только структурный реестр (имя/стиль/ABV), «мета»
строим из наблюдаемых рыночных сигналов, не из user-оценок (источника нет + юр-риск).
Анти-скоуп: не рейтинги/чек-ины, не доставка, не «купи здесь»-промо, не закрытый
B2B-контур сейчас, не «всё пиво», не полнота хвоста любой ценой. Документация приведена
в порядок: drift-to-value.md (раздел «Решение»), gtm/positioning/phases/mvp-research-mode
получили forward-notes (разведены противоречия «закрытый B2B» vs «открытый справочник» и
«рискованная зона где-купить» vs «нейтральная рыночная инфо»), index.md обновлён.
Зависимые задачи: task-20 разморожена как есть; task-15 поднята low→medium (consumer-
facing); task-6 разделена (дайджесты→task-11, TG-промо байерам заморожен); task-7/8
остаются заморожены как дверь монетизации. Кода не трогали — это стратегическое решение.
Доп.: заведены 3 страницы под концепты, ранее размазанные по вики — strategy/
availability-moat.md (граф доступности как первичный ров), strategy/neutrality-as-moat.md
(нейтральность как второй ров, антипозиция к продавцам-инкумбентам), strategy/
legal-boundary.md (сведённая юр-рамка ст.21: рыночная инфо vs продвижение). Добавлены в
index.md + входящие ссылки из gtm/risks/positioning/drift-to-value/mvp-research-mode/
need-and-demand/competitors/analogs/data-model.

## [2026-06-01] product | task-20 — блок «Где найти» на карточках (ров видим в UI)
Diff: ров доступности перестал быть невидимым в данных — теперь первоклассный блок на
карточках. export-catalog.ts: классификатор sellerKind (shop / bar=t.me/* / opt) +
per-seller разбивка — beer.demand.places[] (kind, minPrice, formats[], discounted, seenAt)
и brewery.demand.places[] (kind, listedBeers). Существующие агрегаты (reach/listings/
minPrice — их читает /top) не тронуты. Розничная «цена от» теперь исключает не только опт
(kraftbeer.ru), но и КЕГ (30л — не потребительская розница) → заодно чистка грязного
maxPrice (известная проблема). lib/catalog.ts: типы SellerKind/Place/BreweryPlace +
экспортируемые хелперы fmtPrice/plur/sellerLabel/SELLER_KIND_LABEL/formatLabel (обе
карточки переиспользуют, /top не трогали). UI: /beer/[slug] — блок «Где найти» сразу
после характеристик (продавец+бейдж тип+форматы+«от X₽»/«разлив»/«опт»+дата+note);
/brewery/[slug] — компактный агрегат (reach + чипы продавцов с числом сортов) после
офиц. ссылок. Подача — «рыночная информация о доступности» (рамка legal-boundary.md):
имя продавца — ссылка на его сайт/TG (sellerUrl, провенанс, новая вкладка), не CTA
«купить». Проверка: typecheck 0,
svelte-check 0/0, web:build — пререндер 17k+ карточек зелёный, блок подтверждён в HTML
(«от 520 ₽», «разлив», «опт», дата, best-effort note). Закрывает AC#1-4 task-20.

- 2026-06-02 promote-sorts sweep ×25 пивоварен (pipeline-run, 3 батча, 13 субагентов sonnet ×2-3): довалидация всего негейтового остатка. ИТОГ — validate 8, merge 81 (вариант-имена → канон: магазин прятал реальный сорт в начало raw-строки, в slug попадал суффикс коллаба/пивоварни — «Coconut Shores (Frozen)» из `collaboration-with-…`, «Static Cloud» из `mosaic-…`), drop 9 (пустые-slug/мусорные артефакты storebeer), review 4 (неоднозначные: black-pepper, Barley Wine, Alexander Platz/Kali's Kiss, Tomato Mead). Стадии: validated-пивоварен 140→162, ingested 26→4, auto-сортов 170→72, сортов 18215→18126 (схлоп дублей). 2 субагента оставили stale-записи в JSON (stamm validate 84, volkovskaya merge 5 с прошлого прохода) — поймано валидацией (from=auto/into-exists) перед применением, переписано начисто. **План БЕЗ ГЕЙТОВ пуст.** Остаток auto (72): 67 в 6 blocked-пивоварнях (мёртвые источники: medovarnya/victory-art-brew/hops/crazy-brew/sorre/xp-brew) + 5 в 4 human-review (salden-s/4-brewers/rewort/volkovskaya). Следующее — гейты человека (review-4 + demand/скоуп) либо свежесть (task-24/25, пороги ещё не настали).

- 2026-06-02 human-review разобран ресёрчем (4→0, [[resolve-disputes-by-research]]): salden-s `black-pepper` → merge в `ipa-black-pepper` (бар написал «Black Pepper» без «Tomato Gose» → сокращение IPA, не гозе); 4-brewers `collaboration-with-4brewers` → drop («Tomato Mead» = медовуха Steppe & Wind Meadery, не пиво/чужой производитель); volkovskaya `barley-wine` → validate (Untappd: отдельный «Barley Wine», Barleywine-English 8.95%, не дубль black-swan/sinyaya-yama); rewort `kali-s-kiss`+`alexander-platz` → один сорт (Untappd «Alexander Platz (ex Kali's Kiss)», Sour Tomato Gose 6.3%): merge kali-s-kiss→alexander-platz + validate. ИТОГ: human-review 4→0, план без гейтов пуст, ВЕСЬ остаток auto (67) — только в 72 blocked-пивоварнях (мёртвые источники). Дальше — только demand/скоуп (новые города) и свежесть (task-24/25).

- 2026-06-08 promote-sorts batch (pipeline-run, 3 субагента sonnet ×3 пивоварни). Топ-приоритет плана — promote-sorts ×39 в очереди. Обработан первый батч из 9: 4-brewers, afbrew, alaska, big-pot, black-cat-brewery, brewlok, brewmen, burning-brewery, chibis-brewery. ИТОГ по применению всей директории промоушнов (с накопленными pending): validate 108, merge 25, drop 17, review 39. Заметное: afbrew — drop 5 (Symbiotica Hard Seltzer/Pear Perry — не пиво/сидр); big-pot — drop 5 мусорных фрагментов магазинных листингов (незакрытые скобки); chibis — 6 в review (имена серий без спецификации хопов/версии). Стадии: beers 22098→22092 (схлоп). Остаток promote-sorts в плане: 30 пивоварен (39−9). Следующий батч — продолжить очередь promote-sorts (coven-brewery…tarkos).

- 2026-06-08 human-review разобран ресёрчем (pipeline-run, 5 субагентов sonnet, [[resolve-disputes-by-research]]). На входе 28 пивоварен в гейте = 58 спорных auto-сортов (источник истины — auto-сорта в БД, а не замусоренный needsReview). ИТОГ: **38 разрешено, 20 осталось**. Разрешения: validate — black-cat «For All the Dogs Non-Alcoholic» (отдельный безалк-сорт), 4-brewers «Motueka Cryo» (коллаб-пилснер с Velka Morava). drop (чужой бренд/не пиво/мусор) — hops ВСЕ 8 (Plague Brew=СПб-пивоварня, True Hops Ale/IPA/Stout=New Riga's, North Hops Blond/Kriek неидентиф., Steppe&Wind=мид, Yellow Hops), afbrew «Symbiotica Perry»=грушевый сидр, salden-s «Сидр Сухой»=сидр, panzer «Cascade»=хмель, konix «Barrel Aged»=суффикс, dieta «Diet»/«MCGA»=обрезки, magic-mess «American IPA»=стиль, labeerint/big-pot=имя пивоварни в скобках. merge в каноны — tarkos (Жигулёвское 1980/1970), dieta (ider→dietaider-weisse, вишня-шоколад), magic-mess (Torpeda Melon→torpeda), red-button (BUT70N 0F→…481L17Y), jaws (DIPA→hyper-india-dipa, Атомная Прачечная→nuclear-laundry), selfmade (BFG Double IPA→bfg), coven (Minerva→minerva), panzer (Мякоть БГА→banan-guava-malina), salden-s (Triple IPA→triple-ipa), paradox (ITY→paradoxity), rewort (hot-in-the-shade), zavod (01→mass-01), zagovor (simcoe→street-justice-simcoe), velka-morava (mosaic-hyperboost, riwaka-amplifire). promote-sorts.ts итог: validated 123, merged 19, dropped 17. beers 22024→21990 (−34, схлоп+дропы). **Попутно почищен needsReview**: накопил дубли по датам (06-02/06-03/06-08×N) — перезаписан начисто, у 18 разрешённых пивоварен флаг снят, у 10 оставлено ровно по числу реально неоднозначных сортов. ОСТАЛОСЬ 20 в 10 пивоварнях (настоящие неоднозначности, без нового источника не решаются): серии без указания варианта (chibis APA/IPA/sour-bank/a-bit-of-haze + 2 магазинных имени; mantra Dessert Messiah/Fracture; magic-mess Пятница/Четверг; zagovor Eleven/Street Justice; velka Mosaic Cryo/Riwaka), усечённые/ненайденные (white-stone Do Zen/Красный; jaws Ветерок Манго-Маракуйя; brewlok Party Hop; 4-brewers Саур эль 22 Turn; stamm 04). Гейт human-review 28→10. План первичной заливки пуст.
