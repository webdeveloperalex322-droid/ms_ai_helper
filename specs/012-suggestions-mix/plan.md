# Implementation Plan: Расширенный набор подсказок и порционный показ

**Branch**: `012-suggestions-mix` | **Date**: 2026-10-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-suggestions-mix/spec.md`

## Summary

Экран ассистента показывает 21 заготовленную подсказку, все товарные, все с одним контекстом `catalog`; поля `active_from`/`active_to`, `allowed_br` и `screen_context` в схеме есть, но раскладки по экранам и времени суток нет, а лимит экрана режет выборку до сортировки. Работа делится на две части. Первая — наполнение: каталог вырастает до 49 подсказок, включая 8 сервисных с намерением `info_question` (путь ответа из базы знаний готов фичей 011), 6 по диете и исключениям, 11 сценарных и 4 вида «похож на X». Вторая — отбор: `SuggestionService` превращается в отбор набора из 6 позиций — пригодность (товары для товарных, проиндексированная база знаний для сервисных), вес из порядка администратора, доли выборов за 30 дней и части суток, затем детерминированная взвешенная выборка с seed от `session_id` и квотой 1–2 сервисных места. Новые поля: `screen_contexts jsonb` у подсказки, `calories_max` в слотах, `caloriesMax` в фильтрах каталога, необязательный `session_id` в запросе списка.

## Technical Context

**Language/Version**: TypeScript 5.x, Node >= 22

**Primary Dependencies**: NestJS 10 + Fastify, Drizzle ORM 0.38, PostgreSQL + pgvector. Новых внешних зависимостей нет: часть суток считается через `Intl.DateTimeFormat` с часовым поясом, генератор случайных чисел — mulberry32 на ~10 строк в `src/common/`

**Storage**: PostgreSQL. Одна миграция через `pnpm db:generate`: колонка `assistant_suggestions.screen_contexts jsonb`. Читаются существующие `assistant_suggestion_events`, `site_page_chunks`, `products`, `city_products`

**Testing**: Vitest — юнит `src/modules/suggestions/tests/*.spec.ts` (отбор, веса, часть суток, квота, детерминизм seed), интеграционные `test/**/*.test.ts` на фейковой БД по образцу `category-filter.test.ts`

**Target Platform**: Linux-контейнер (compose), тот же сервис

**Project Type**: модульный монолит, затрагиваются модули `suggestions`, `catalog`, `admin-config`, `site-knowledge` (чтение), `database/schema`, `seeds`

**Performance Goals**: список подсказок — p95 ≤ 300 мс (SC-006) при каталоге 49 подсказок: один агрегат статистики на `rn|target` раз в минуту из кеша, одна проверка базы знаний на `rn|br` раз в 5 минут из кеша, проверки наличия товаров — пакетно с ограничением одновременности и кешем

**Constraints**: ответ списка никогда не ошибка — недоступность статистики, базы знаний или проверки товаров деградирует в нейтральное поведение (ADR-005); обратная совместимость контракта `GET /v1/assistant/suggestions` (новый параметр необязательный, формат элементов не меняется, добавляются поля); обратная совместимость админского API подсказок (`screen_context` продолжает работать)

**Scale/Scope**: 49 подсказок на сеть, 4 контекста экрана, 3 окна времени суток; порядка 7 новых/изменённых файлов в `src/`, 1 миграция, 1 сид

## Constitution Check

`.specify/memory/constitution.md` не заполнен (шаблон). Гейты — конвенции `CLAUDE.md` и ADR из [docs/knowledge/decisions.md](../../docs/knowledge/decisions.md):

| Гейт | Статус |
|------|--------|
| БД только через `@Inject(DATABASE_TOKEN)`, схема в `src/database/schema`, миграции через `db:generate` | PASS — `screen_contexts` добавляется в `assistant-suggestions.ts`, миграция генерируется, SQL руками не пишется |
| Env только через Zod `configuration.ts` | PASS — новые переменные (лимит набора, окна суток, пояс, период и порог статистики, веса) объявляются в схеме с значениями по умолчанию |
| Эндпоинт всегда отвечает (ADR-005) | PASS — пустой набор возвращается как `{ suggestions: [] }`; сбои статистики и проверок пригодности не поднимаются выше |
| Два LLM-слоя не смешивать (ADR-001) | PASS — LLM не затрагивается вовсе |
| Категория из слота резолвится через справочник (ADR-012) | PASS — новые подсказки используют легаси-слаги `drink`/`sauce`/`dessert`/`hot`, которые резолвер уже знает |
| Mock-by-default (ADR-006) | PASS — отбор не требует внешних провайдеров; сервисные подсказки скрываются в городах без базы знаний |
| Тесты рядом с модулем | PASS |
| Правка данных подсказок идемпотентна | PASS — сид по-прежнему `onConflictDoUpdate` по `(rn, code)` |

Нарушений нет; Complexity Tracking не заполняется.

Новые ADR по итогам работы (для [docs/knowledge/decisions.md](../../docs/knowledge/decisions.md)):

- **ADR-013**: набор подсказок отбирается взвешенной выборкой с детерминированным seed от `session_id` — ротация без состояния в БД.
- **ADR-014**: пригодность сервисной подсказки проверяется наличием проиндексированной базы знаний города, а не наличием товаров.
- **ADR-015**: часть суток влияет на вес подсказки через `payload.slots.scenario`; `active_from`/`active_to` остаются абсолютными окнами показа.

## Project Structure

### Documentation (this feature)

```text
specs/012-suggestions-mix/
├── plan.md              # этот файл
├── spec.md
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1
│   ├── suggestions-list.md
│   ├── selection-algorithm.md
│   └── admin-suggestion.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── config/
│   └── configuration.ts                      # ИЗМ: лимит набора, окна суток, пояс, статистика, веса
├── common/
│   └── random/seeded-random.ts               # НОВЫЙ: mulberry32 + хеш строки в seed
├── database/
│   ├── schema/assistant-suggestions.ts       # ИЗМ: screen_contexts jsonb, calories_max в слотах
│   └── migrations/00XX_*.sql                 # НОВЫЙ: db:generate
├── modules/
│   ├── suggestions/
│   │   ├── controllers/suggestions.controller.ts   # ИЗМ: session_id, контексты экрана
│   │   ├── services/suggestion.service.ts          # ИЗМ: отбор вместо «первые N»
│   │   ├── services/suggestion-selector.service.ts # НОВЫЙ: веса, квота, выборка (чистая логика)
│   │   ├── services/suggestion-stats.service.ts    # НОВЫЙ: агрегат событий + кеш
│   │   ├── services/day-part.service.ts            # НОВЫЙ: часть суток и карта сценариев
│   │   ├── services/suggestion-eligibility.service.ts # НОВЫЙ: товары пакетно + база знаний
│   │   └── tests/*.spec.ts                         # НОВЫЕ юнит-тесты
│   ├── catalog/services/catalog.service.ts    # ИЗМ: caloriesMax в CatalogFilters
│   ├── assistant/services/shortlist-builder.service.ts # ИЗМ: calories_max, отсечение образца
│   └── admin-config/dto/{create,update}-suggestion.dto.ts # ИЗМ: screen_contexts, calories_max
└── seeds/
    └── suggestions.seed.ts                    # ИЗМ: 21 → 49 подсказок, контексты, сценарии

test/
└── integration/suggestions-selection.test.ts  # НОВЫЙ: сквозной отбор на фейковой БД
```

**Structure Decision**: модуль `suggestions` разделяется на тонкий сервис-оркестратор и три узких сервиса (пригодность, статистика, отбор) плюс чистый расчёт части суток. Причина — требования FR-008–FR-029 проверяемы только при отделении чистой логики отбора от доступа к данным: `SuggestionSelectorService` и `DayPartService` тестируются без БД, а `SuggestionStatsService` и `SuggestionEligibilityService` имеют по одному запросу и кешу каждый.

## Phase 0 — исследование

Выполнено: [research.md](./research.md). Решены алгоритм отбора (R1), подсчёт статистики (R2), множественные контексты экрана (R3), пригодность сервисных подсказок (R4), время суток (R5), `session_id` (R6), данные под новые подсказки и два расширения фильтров (R7), три дефекта текущего отбора, блокирующие требования (R8). Открытых `NEEDS CLARIFICATION` нет.

## Phase 1 — проектирование

Выполнено:

- [data-model.md](./data-model.md) — изменения `assistant_suggestions`, вычисляемые сущности (статистика, пригодность, часть суток, кандидат отбора), полный перечень 49 подсказок с кодами, типами, контекстами и слотами.
- [contracts/suggestions-list.md](./contracts/suggestions-list.md) — контракт `GET /v1/assistant/suggestions` с `session_id` и расширенным элементом ответа.
- [contracts/selection-algorithm.md](./contracts/selection-algorithm.md) — контракт отбора: формула веса, квота типов, детерминизм, деградации.
- [contracts/admin-suggestion.md](./contracts/admin-suggestion.md) — изменения админского API подсказок и правила обратной совместимости.
- [quickstart.md](./quickstart.md) — прогон проверки: миграция, сид, запросы по контекстам, проверка стабильности и ротации, влияние статистики.

### Post-design Constitution Check

Повторная проверка после проектирования: нарушений нет. Миграция одна и аддитивная, переменные окружения объявлены в Zod-схеме, внешних зависимостей не добавлено, LLM-слои не затронуты, все пути отказа деградируют до нейтрального поведения.

## Phase 2 — следующий шаг

`/speckit-tasks` — разбиение на задачи по приоритетам историй: P1 отбор и лимит (US1), P2 сервисные подсказки (US2) и диета/сценарии (US3), P3 контексты и время суток (US4) и статистика (US5).
