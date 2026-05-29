# Telegram-источники для парсинга

Парсер `telegram-web` берёт публичное превью `t.me/s/<channel>`
([[parser-architecture]]). Нужны каналы с **прайсами и новинками**, а не только
медиа.

## Стартовый seed (в коде: `packages/parsers/src/sources.ts`)

Пока — преимущественно медиа/индустриальные каналы (для проверки парсера, не для
прайсов):

- `@pivnoe_delo` — Пивное дело (индустрия, аналитика, каталоги пивоварен).
- `@beervaria` — Бирвария (сеть магазинов — возможны наличие/цены).
- `@moronityandbeer` — Слабоумие, отвага и крафтовое пиво (медиа).
- `@prostopropivo` — Просто Про Пиво (образовательный).

## Офиц. каналы пивоварен (верифицировано 2026-05-29, для task-13)

Подтверждённые офиц. Telegram-каналы топовых крафт-пивоварен (превью `t.me/s/<handle>`
проверено). Это первоисточник характеристик сортов (стиль/ABV/IBU/описание) →
наводим на них `parseBreweryReleases`. Хранятся в `breweries.links` (`data/catalog.sqlite`).

| Пивоварня | Город | Telegram |
|---|---|---|
| AF Brew | СПб | `@afbrewandco` |
| Бакунин | СПб | `@bakunin_telegram` |
| Stamm Brewing | Красная Пахра (МО) | `@stammbeer` |
| Zagovor Brewery | Мытищи | `@zagovorbrewery` |
| Selfmade Brewery | Москва | `@selfmadebrew` |
| Jaws Brewery | Заречный (Свердл.) | `@jawsbrewery` |
| Salden's | Тула | `@saldensbrewery` |
| Konix Brewery | Заречный (Пенза) | `@konix_brewery` |
| 4 Brewers | Владимир | `@fourbrewers` |
| Big Village Brewery | Краснодар | `@big_village_brew` |
| Brewlok | Воронеж | `@brewlokbrewery` |
| HopHead Brewery | СПб | `@hopheadbrewery` |

Без подтверждённого офиц. TG (соцсети — VK/сайт): Victory Art Brew, Plan B, 1516, Lighthouse.

## Что нужно найти (бэклог `task-1`)

Каналы боттлшопов и оптовиков, где регулярно постят **наличие + цены + новинки**:
каналы магазинов (Бирвария и аналоги), оптовиков HoReCa, отдельных пивоварен с
анонсами варок. Цель: 15+ каналов, каждый даёт beers+listings > 0 через парсер.

## Заметки
- `beermapbot` — бот «Крафтовое пиво в Москве», изучить как источник/конкурента.
- Для каналов-агрегаторов прайсов проверить формат постов (структурирован ли он)
  — от этого зависит точность экстрактора.
