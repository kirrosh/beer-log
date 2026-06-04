# Личный слой (data/personal/)

Личные данные пользователя поверх demand-каталога. **Источник правды — эти JSON, правит агент** (UI пока нет). Отделено от `catalog.sqlite` (публичный) и `data/pipeline/shops.json` (реестр точек). НЕ попадает в публичный экспорт витрины.

## tastings.json — что пробовал / отзывы / избранное
Шкала вердикта (решение пользователя): **простая, не числовая** — `fire` 🔥 топ / `good` 👍 норм / `pass` 👎 мимо, плюс `wouldRepeat` (возьму снова) и `favorite` ⭐.

Как метить (агент): найти `beerId` в `beers` по «Пивоварня Сорт» (или взять из листинга точки), добавить объект в `tastings[]`. Если сорта нет в каноне — `beerId: null` + заполнить `beer`. Поля и пример — в `_schema` файла.

Типовые запросы пользователя → действие:
- «пометь что пробовал X, зашло/не зашло» → добавить tasting с verdict.
- «добавь отзыв на X» → note + descriptors.
- «что я уже пробовал / мои топы» → читать tastings, группировать по verdict/favorite.

## highlights.json — топовое НА ТОЧКЕ (редакторское)
Пара `(venue, beerId)` + `badge` + `reason`. Это «рекомендуем тут», НЕ личный вкус (тот в tastings.favorite). `venue` = seller точки из `shops.json` (напр. `beermug-nn/gagarina-118`). Из highlights собирается контент-юнит «крафт-локатор» (что брать в точке сегодня) — формат на потом.

## Связи
- `beerId` → `beers.id` в `catalog.sqlite`
- `venue` → `ingestConfig.venues[].seller` в `data/pipeline/shops.json`
- Фото (`media`) — рехостить в S3, как этикетки сортов (см. memory `images-rehost-decision`).
