---
id: TASK-32
title: 'Запрос словами → структурный фильтр (стиль/ABV/цена/формат)'
status: To Do
assignee: []
created_date: '2026-06-04 12:00'
milestone: 'M4: Поиск на точке'
labels:
  - search
  - llm
dependencies:
  - TASK-30
references:
  - vault/strategy/m4-craft-locator.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Подзадача B2. Естественный запрос «кислое до 500», «что покрепче но не очень», «лёгкое пшеничное на
вынос» → один дешёвый LLM-вызов парсит в структурный фильтр {style, abvRange, priceMax, format} → SQL
по пулу точки. LLM только на парс запроса (редко, дёшево), не в матче и не на каждый чих. Без запроса —
обычные фильтры из UI.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Парсер запроса (LLM) → JSON-фильтр со схемой {style?, abvMin?, abvMax?, priceMax?, format?, tasteTags?}
- [ ] #2 Фильтр → SQL по (venue, объединённый пул); деградация при пустом результате (ослабить условия)
- [ ] #3 Прогон на Beer Mug: «кислое до 500», «крепкий стаут», «лёгкое на вынос» дают осмысленную выборку
<!-- AC:END -->

## Implementation Notes
<!-- SECTION:NOTES:BEGIN -->
beers уже имеет style_name/style_category/abv. format в листинге. tasteTags пока опц. (descriptors из tastings/каталога). Кэшировать частые запросы. Не смешивать с fuzzy-именем (TASK-30) — это другой вход.
<!-- SECTION:NOTES:END -->
