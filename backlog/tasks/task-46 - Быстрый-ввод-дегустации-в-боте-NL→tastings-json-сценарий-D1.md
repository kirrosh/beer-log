---
id: TASK-46
title: 'Быстрый ввод дегустации в боте: NL → tastings.json (сценарий D1 эпика #29)'
status: Done
assignee: []
created_date: '2026-06-05 10:00'
labels:
  - personal
  - bot
  - ux
  - ingest
milestone: 'M4: Поиск на точке'
dependencies:
  - TASK-30
  - TASK-33
  - TASK-45
references:
  - data/personal/tastings.json
  - scripts/lib/venue-personal.ts
  - scripts/lib/catalog-matcher.ts
  - scripts/lib/venue-registry.ts
  - scripts/bot-lookup.ts
  - .claude/skills/beer-concierge/SKILL.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Сообщение в боте словами → запись дегустации в `tastings.json`. Пример: «выпил Jaws Атомную
на Гагарина, fire, смолисто» → `{ beerId, beer, verdict: "fire", descriptors: ["смола"],
venue: "beermug-nn/gagarina-118", format: "draft", tastedAt }`.

**Зачем (Кирилл): самый недооценённый рычаг, дёшево.** Сейчас `tastings.json` правится вручную
(4 записи). Без объёма дегустаций «топ-5 под меня» (#43) и «твой вердикт» в лукапе (#bot-lookup)
остаются бедными — а это сердце персонализации. Каждая запись питает #43/#44 и весь личный слой.
Это сценарий **D1 эпика #29** («Вклад на месте: отметить взятое — tasting+venue»).

**Дёшево, потому что фундамент готов:** канал = БОТ как Claude Code channel (#45), значит
**извлечение полей из естественного языка делает сам агент** (skill `beer-concierge`), а не
regex/NLP-парсер. Матчер сорта (#30) и реестр точек уже есть. Не хватает одного звена —
детерминированного **писателя** `tastings.json` (атомарная дозапись + резолв beerId/venue +
дедуп). Сейчас файл `tastings.json` только читается (`venue-personal.ts:45`), кода записи нет.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Скрипт-писатель `scripts/record-tasting.ts` + `appendTasting()` в `venue-personal.ts`: принимает структуру (beer/verdict/venue/format/descriptors/note/pricePaid/wouldRepeat/favorite/tastedAt) через `--json` или флаги, дозаписывает в `data/personal/tastings.json` (read→push/merge→write, сохраняя `_schema` и формат «запись на строку»), идемпотентно по ключу `beerId|raw-имя + tastedAt` (venue из ключа исключён намеренно — уточнение точки домерджится); печатает итог + что распозналось
- [x] #2 Резолв сорта → beerId через `bot-lookup.ts` (каскад #30, без дублирования матчера). Авто-приём ТОЛЬКО при ровно одном точном BASE-матче имени; вне канона → `beerId:null` + `beer` как есть; ноль/≥2 вариантов (Атомная Прачечная ×5, Milk of Amnesia безалк./IPA) → `status:"ambiguous"` + кандидаты с обложками, НЕ пишем молча → агент уточняет → перевызов с `--beer-id`
- [x] #3 Резолв venue: `resolveVenue()` в `venue-registry.ts` — «Гагарина»/«Beer Mug»/seller → slug (translit-устойчивый fuzzy по имени/адресу в HOME_CITY, уверенный лидер vs кандидаты). Не нашлось/неоднозначно — пишем без `venue`, запись не блокируется
- [x] #4 Маппинг вердикта (страховка в скрипте + зафиксирован для агента в SKILL): огонь/топ/кайф/🔥→`fire`, норм/ок/пойдёт/👍→`good`, мимо/не зашло/👎→`pass`. `descriptors` нормализуются (lower/trim/dedup), `tastedAt`=сегодня по умолчанию, `format` задаёт агент
- [x] #5 Флоу в `beer-concierge/SKILL.md` (интент #5 переписан): извлечь поля → `record-tasting.ts` → при `recorded` богатое подтверждение (обложка/вердикт-эмодзи/точка), при `ambiguous` — карточки кандидатов ОДНОЙ репликой, по ответу перевызов с beerId
- [x] #6 Smoke прогнан на матрице: уникальные (Золотой час, Моно Цитра — записаны без трения), вариантные (Milk of Amnesia, Атомная Прачечная — ушли в выбор), `--beer-id` подтверждение, вне канона (beerId:null), банка+флаги, дедуп/merge (повтор не плодит дубль, total стабилен). Тестовые записи откатаны, реальный `tastings.json` не тронут
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Разделение ответственности (ключевое):** NL-понимание = агент (`beer-concierge` skill, бесплатно
в рамках channel #45), детерминизм = скрипт. НЕ писать NLP-парсер на regex — агент уже умеет
извлекать `{сорт, venue, verdict, format, descriptors, price}` из фразы. Скрипт принимает уже
структуру и отвечает за резолв id + атомарную запись + дедуп.

**Переиспользование (почти всё готово):**
- Резолв сорта: `scripts/lib/catalog-matcher.ts` (`buildMatcher`, `isSameBeer`) + готовый
  `scripts/bot-lookup.ts` (детерминированный лукап сорт→canonical, ~0.2с) — обернуть, не писать заново.
- Резолв venue: `scripts/lib/venue-registry.ts` (HOME_CITY, реестр `data/venues/registry.json`,
  slug-формат `beermug-nn/gagarina-118`).
- Чтение/тип: `Tasting` + `loadPersonal()` в `scripts/lib/venue-personal.ts:44`. Добавить парную
  `writeTasting()`/`appendTasting()` рядом (сейчас есть только чтение `readJsonArray`).

**Запись:** аккуратно сохранить `_schema` и стиль (по записи на строку, как сейчас). Атомарность —
write в temp + rename, или просто read-modify-write (один писатель, гонок нет — SQLite-урок про
single writer тут не применим, это JSON). Дедуп-ключ: `beerId ?? beer` + `tastedAt` + `venue`.

**Граница с recordListing:** дегустация (личный слой, `tastings.json`) ≠ листинг (доступность,
`price_listings` через `recordListing` в `packages/store/src/repo.ts:163`). НЕ путать. Но если в
дегустации есть venue+format+price и сорта нет в пуле точки — опц. побочно вызвать `recordListing`
(`sourceType: "user"`) как сигнал наличия. Вынести в отдельный AC/таск, чтобы не раздувать D1.

**Будущее (не в скоупе):** фото банки в руке → vision→название→эта же запись (стык с #44);
голосовое → транскрипт→эта же запись; `CloudStorage` мини-аппа как черновик без раунд-трипа (#44 notes).

**Метрика успеха:** растёт `tastings.json` → растёт качество #43 и «твой вердикт». Это вход, не выход.

---
**Сделано (2026-06-05):**
- `scripts/lib/venue-personal.ts`: расширен `Tasting` (note/pricePaid/tastedAt/media), добавлен
  `appendTasting()` — атомарная идемпотентная дозапись с сохранением `_schema` и формата «запись на
  строку». Ключ дедупа `beerId|raw-имя + tastedAt` (venue вне ключа — см. комментарий в коде).
- `scripts/lib/venue-registry.ts`: `resolveVenue()` + `venueScore()` — translit-устойчивый fuzzy
  «Гагарина»→`beermug-nn/gagarina-118`, уверенный лидер vs кандидаты.
- `scripts/record-tasting.ts` (новый): CLI `--json`/флаги → резолв сорта через `bot-lookup`
  (правило «ровно один BASE-матч», иначе `ambiguous`+кандидаты), резолв venue, запись. Маппинг
  вердикта/дескрипторов. Выход — компактный JSON статуса для агента.
- `.claude/skills/beer-concierge/SKILL.md`: интент #5 переписан под скрипт + дисамбигуацию карточками;
  интент #1 — фиксация контекста после показа сорта; правило про голосовое (STT нет → TASK-47).
- **Контекст диалога (надёжность связки «фото→позже зашло»):** проверено — Telegram Bot API истории
  НЕ хранит, на диске лога сообщений нет (`~/.claude/channels/telegram/` = pid/access/env), память =
  только живая сессия → при компактизации точный beerId теряется. Добавлен слой `scripts/lib/bot-
  context.ts` + CLI `scripts/bot-context.ts` (set/get/clear, per chat_id, TTL 12ч, gitignored
  `data/personal/.bot-context.json`). `record-tasting.ts --chat <id>` подтягивает последний сорт,
  если дегустация без названия. Контекст пишет агент только при ОДНОЗНАЧНОМ сорте (фото/уточнённый
  лукап), не bot-lookup автоматически — чтобы не закрепить неверный вариант.
- **Ключевое решение:** авто-приём сорта ТОЛЬКО при единственном точном BASE-матче имени. Эмпирика
  на каталоге (Атомная Прачечная: 2 BASE; Milk of Amnesia: 0 BASE, безалк vs IPA) показала, что
  edit-distance/gap систематически берёт не тот edition → тихая запись портит сигнал #43. Дешевле
  один уточняющий тап (карточки с обложками) — это и есть нужный богатый UX бота.
<!-- SECTION:NOTES:END -->
