---
name: promote-sorts
description: Курируемый промоушн сортов пивоварни auto→validated. Чистит имена (транслит→норма), сливает дубли, отсеивает не-пиво, валидирует уверенные; спорные — в очередь человеку. Используй, когда в очереди pipeline-status есть "promote-sorts", или по запросу "почисти/валидируй сорта <пивоварни>".
---

# Промоушн сортов auto→validated

Сорта со `status='auto'` приходят из магазинов (`ingest-shop*`) — имена шумные
(транслит латиницей, остатки объёма, дубли с каноном под другим алфавитом, не-пиво).
Задача: за один проход по **одной пивоварне** превратить их в чистый канон.

Политика автономии: **уверенные решения применяй сам** (validate/merge/drop),
**спорные — в `review`** (уйдут человеку через overrides.json). Лучше отправить в
review, чем испортить канон.

## Шаги

1. Прочитай сорта пивоварни (slug передаётся в запросе):
   ```bash
   bun -e "import {Database} from 'bun:sqlite';const d=new Database('data/catalog.sqlite',{readonly:true});const b=d.query('SELECT id,name FROM breweries WHERE slug=?').get('<SLUG>');for(const r of d.query('SELECT slug,name,style_name,abv,status FROM beers WHERE brewery_id=? ORDER BY status,name').all(b.id))console.log(r.status,'|',r.slug,'|',r.name,'|',r.style_name||'—',r.abv||'')"
   ```
   `validated` сорта — это эталон (из TG/Untappd, чистые имена/стили). `auto` — кандидаты.
2. По возможности сверься с источниками пивоварни (Untappd-страница, TG) — там чистые
   имена/стили. Узнать источники: `data/ingest-hints.json` (блок пивоварни) и
   `breweries.links`. Можно открыть Untappd `/beer` и сопоставить.
3. Для каждого `auto`-сорта реши:
   - **validate** — реальное пиво, имя читаемо (поправь транслит на узнаваемое имя:
     "Ruka Boga"→"Рука Бога" если так в источнике; иначе оставь латиницу как есть).
     Если стиль очевиден из имени/источника — укажи `styleRaw`. Уверен → сюда.
   - **merge** — дубль уже существующего сорта (auto или validated) под другим написанием/
     объёмом. `from`=дубль, `into`=канон (предпочитай validated как канон).
   - **drop** — НЕ пиво (тоник/комбуча/сидр/мерч проскочил), мусорное имя, набор/подарок.
   - **review** — сомневаешься (непонятное имя, может дубль, может не пиво) → человеку,
     с коротким `reason`.
4. Запиши решения в `data/pipeline/promotions/<SLUG>.json` (формат ниже).
5. Применить: `bun run scripts/promote-sorts.ts data/pipeline/promotions/<SLUG>.json`
6. Обнови дашборд: `bun run scripts/pipeline-status.ts` (auto должно упасть, validated вырасти).

## Формат решений
```json
{
  "brewery": "<slug>",
  "validate": [{ "slug": "<тек.slug>", "name": "<чистое имя>", "styleRaw": "IPA - American", "abv": 6.5 }],
  "merge":    [{ "from": "<slug-дубля>", "into": "<slug-канона>" }],
  "drop":     ["<slug>"],
  "review":   [{ "slug": "<slug>", "reason": "непонятно, возможно дубль X" }]
}
```
`styleRaw`/`abv` — опциональны (укажи только если знаешь; не выдумывай). `slug` сортов —
существующий (из шага 1); скрипт правит имя/стиль/статус, slug не меняет (стабильный ключ).

## Правила
- Не выдумывай ABV/стиль — только из источника/очевидного имени.
- Транслит → нормальное имя ТОЛЬКО если уверен в оригинале; иначе оставь как есть (не порти).
- Дубль определяй по смыслу, не только по строке ("Атомная Прачечная" = "Atomnaya Prachechnaya").
- Сомнение → `review`, не `validate`.
- После применения сорта остаются связанными с листингами (provenance/цены не теряются).

Связано: `vault/product/operating-pipeline.md`, `scripts/promote-sorts.ts`, `scripts/pipeline-status.ts`.
