---

description: "Task list for 012-suggestions-mix"
---

# Tasks: Расширенный набор подсказок и порционный показ

**Input**: Design documents from `/specs/012-suggestions-mix/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: включены — проект держит юнит-тесты рядом с модулем (`src/**/*.spec.ts`) и интеграционные в `test/`, требования FR-012/FR-024/FR-026 проверяемы только тестами.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: можно выполнять параллельно (разные файлы, нет зависимости от незавершённых задач)
- **[Story]**: к какой истории относится задача (US1…US5)
- Пути указаны от корня репозитория

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: настройки и чистые утилиты, от которых зависят все истории

- [X] T001 Добавить переменные отбора в Zod-схему `src/config/configuration.ts`: `MAX_SUGGESTIONS_ON_SCREEN` (default 6, переопределяет текущий 8), `SUGGESTIONS_SERVICE_QUOTA_MIN` (1), `SUGGESTIONS_SERVICE_QUOTA_MAX` (2), `SUGGESTIONS_STATS_WINDOW_DAYS` (30), `SUGGESTIONS_STATS_MIN_IMPRESSIONS` (50), `SUGGESTIONS_CTR_WEIGHT` (2.0), `SUGGESTIONS_EXPLORATION_BONUS` (0.15), `SUGGESTIONS_DAYPART_BOOST` (1.5), `SUGGESTIONS_CONTEXT_BOOST` (2.0), `SUGGESTIONS_TIMEZONE` (`Asia/Yekaterinburg`), `SUGGESTIONS_DAYPART_WINDOWS` (JSON-строка с окнами) — значения и смысл по [quickstart.md](./quickstart.md)
- [X] T002 [P] Реализовать детерминированный генератор в `src/common/random/seeded-random.ts`: 32-битный хеш строки + mulberry32, экспорт `seededRandom(seed: string): () => number`
- [X] T003 [P] Юнит-тест генератора в `src/common/random/tests/seeded-random.spec.ts`: один seed → одинаковая последовательность, разные seed → разные последовательности, значения в `[0, 1)`
- [X] T004 [P] Добавить новые переменные с комментариями в `.env.example`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: изменения схемы и общие типы, без которых не стартует ни одна история

**⚠️ CRITICAL**: до завершения фазы истории не начинать

- [X] T005 Добавить колонку `screen_contexts jsonb` и поле `calories_max` в тип слотов в `src/database/schema/assistant-suggestions.ts` (обновить `SuggestionPayload.slots` и экспортируемые типы)
- [X] T006 Сгенерировать миграцию `pnpm db:generate` и проверить получившийся файл в `src/database/migrations/` (аддитивная колонка, без правок руками) — зависит от T005
- [X] T007 [P] Добавить `screenContexts?: string[]` и `calories_max` в `src/modules/admin-config/dto/create-suggestion.dto.ts` и `src/modules/admin-config/dto/update-suggestion.dto.ts` с валидацией перечисления контекстов по [contracts/admin-suggestion.md](./contracts/admin-suggestion.md) — зависит от T005
- [X] T008 [P] Вынести разрешение контекстов и тип подсказки в `src/modules/suggestions/services/suggestion-context.ts`: `resolveContexts(suggestion)` (`screen_contexts` → `screen_context` → `catalog`), `resolveKind(payload)` (`info_question` → `service`, иначе `product`), перечисление `SCREEN_CONTEXTS`
- [X] T009 [P] Юнит-тест разрешения контекстов и типа в `src/modules/suggestions/tests/suggestion-context.spec.ts`

**Checkpoint**: схема и общие типы готовы — истории можно вести параллельно

---

## Phase 3: User Story 1 - Короткий набор подсказок вместо полного списка (Priority: P1) 🎯 MVP

**Goal**: вместо всего каталога эндпоинт отдаёт до 6 подсказок, отобранных детерминированно по `session_id`, с ротацией между сессиями.

**Independent Test**: запросить список для города с полным каталогом — вернулось ≤6 без повторов; два запроса с одним `session_id` совпадают, с разными — различаются (сценарии 1 и 2 [quickstart.md](./quickstart.md)).

### Tests for User Story 1

- [X] T010 [P] [US1] Юнит-тест отбора в `src/modules/suggestions/tests/suggestion-selector.spec.ts`: свойства 1–4 из [contracts/selection-algorithm.md](./contracts/selection-algorithm.md) (размер набора, отсутствие повторов, детерминизм при равном seed, различие при разных seed, отсутствие отфильтрованных кандидатов)
- [X] T011 [P] [US1] Юнит-тест пригодности в `src/modules/suggestions/tests/suggestion-eligibility.spec.ts`: пакетная проверка товаров, кеш на `rn|br|target`, сбой проверки → подсказка считается пригодной (FR-017)

### Implementation for User Story 1

- [X] T012 [US1] Реализовать `src/modules/suggestions/services/suggestion-selector.service.ts`: расчёт `base` из `sort_order`, взвешенная выборка без повторов на `seededRandom`, квота типов с ослаблением (FR-010, FR-011), сортировка результата по весу и `sort_order` — зависит от T002, T008
- [X] T013 [US1] Реализовать `src/modules/suggestions/services/suggestion-eligibility.service.ts`: проверка наличия товаров пакетно с ограничением одновременности и кешем (устраняет последовательные `findByCity` на каждую подсказку), деградация сбоя в «пригодна» — зависит от T008
- [X] T014 [US1] Переписать `src/modules/suggestions/services/suggestion.service.ts` на схему «жёсткие фильтры → пригодность → веса → отбор»: лимит применяется после упорядочивания (устраняет обрыв цикла до сортировки), контексты через `resolveContexts`, в элемент ответа добавляется `kind` — зависит от T012, T013
- [X] T015 [US1] Добавить `session_id` (строка ≤128) и расширенный `screen_context` в `SuggestionsQueryDto` и прокинуть их в сервис в `src/modules/suggestions/controllers/suggestions.controller.ts`, обновить описания Swagger по [contracts/suggestions-list.md](./contracts/suggestions-list.md) — зависит от T014
- [X] T016 [US1] Зарегистрировать новые сервисы в `src/modules/suggestions/suggestions.module.ts` — зависит от T012, T013
- [X] T017 [US1] Интеграционный тест в `test/integration/suggestions-selection.test.ts` на фейковой БД по образцу `test/integration/category-filter.test.ts`: лимит, отсутствие повторов, стабильность и ротация по `session_id`, пустой набор отдаётся как `200` с пустым списком

**Checkpoint**: US1 работает самостоятельно — экран получает короткий ротируемый набор из текущего каталога 21 подсказки

---

## Phase 4: User Story 2 - Сервисные подсказки о доставке, оплате и бонусах (Priority: P2)

**Goal**: в наборе появляются сервисные подсказки, отвечающие из базы знаний города; в городах без базы знаний они скрыты.

**Independent Test**: выбрать `delivery_cost` в Тюмени — пришёл текст со ссылкой на источник и без карточек; в городе без `site:import` сервисных подсказок в списке нет (сценарии 3 и 4 [quickstart.md](./quickstart.md)).

### Tests for User Story 2

- [X] T018 [P] [US2] Юнит-тест доступности базы знаний в `src/modules/suggestions/tests/knowledge-availability.spec.ts`: есть фрагмент со статусом `ready` → доступна, только `pending` → нет, сбой запроса → нет, повторный вызов берётся из кеша
- [X] T019 [P] [US2] Юнит-тест квоты в `src/modules/suggestions/tests/suggestion-selector.spec.ts` (дополнить): в контексте `catalog` при ≥1 пригодной сервисной подсказке их в наборе 1–2; при отсутствии сервисных набор целиком товарный

### Implementation for User Story 2

- [X] T020 [US2] Добавить проверку наличия проиндексированной базы знаний города в `src/modules/site-knowledge/services/site-knowledge-search.service.ts` (метод `hasIndexedKnowledge(rn, br)`: `exists` по `site_page_chunks` со `embedding_status = 'ready'`) — читает индекс `idx_site_page_chunks_rn_br_status`
- [X] T021 [US2] Подключить проверку в `src/modules/suggestions/services/suggestion-eligibility.service.ts`: для `kind = service` пригодность определяется базой знаний с кешем TTL 5 минут, проверка наличия товаров к таким подсказкам не применяется (FR-015, FR-016) — зависит от T020, T013
- [X] T022 [US2] Импортировать `SiteKnowledgeModule` (или его провайдер поиска) в `src/modules/suggestions/suggestions.module.ts` — зависит от T020
- [X] T023 [P] [US2] Добавить 8 сервисных подсказок в `seeds/suggestions.seed.ts` по таблице из [data-model.md](./data-model.md) (`intent: info_question`, пустые слоты, `retrieval_query`, `fallbackPayload`, контексты `catalog`/`checkout`/`empty`, `sortOrder` 300+)
- [X] T024 [US2] Интеграционный тест в `test/integration/suggestions-selection.test.ts` (дополнить): город с базой знаний → в наборе есть `kind: service`; город без базы знаний → сервисных нет, набор добит товарными

**Checkpoint**: US1 и US2 работают независимо; сервисные вопросы закрываются подсказками

---

## Phase 5: User Story 3 - Подсказки по диете, исключениям и сценариям (Priority: P2)

**Goal**: каталог покрывает диетические ограничения, поводы и «похож на X»; подсказки не ведут в пустой результат.

**Independent Test**: выбрать `no_fish`, `veggie_only`, `like_california` — карточки удовлетворяют ограничению, образец отсутствует (сценарии 7 и 8 [quickstart.md](./quickstart.md)).

### Tests for User Story 3

- [X] T025 [P] [US3] Юнит-тест фильтра калорийности в `src/modules/catalog/tests/catalog-calories.spec.ts`: `caloriesMax` отсекает товары выше порога, товары с `calories = null` не отсекаются
- [X] T026 [P] [US3] Юнит-тест отсечения образца в `src/modules/assistant/tests/shortlist-excluded-names.spec.ts`: товар из `excluded_product_names` не попадает в шортлист при любом регистре имени

### Implementation for User Story 3

- [X] T027 [P] [US3] Добавить `caloriesMax` в `CatalogFilters` и условие по `products.calories` в `src/modules/catalog/services/catalog.service.ts`
- [X] T028 [US3] Прокинуть `calories_max` из слотов в фильтры и добавить детерминированное отсечение `excluded_product_names` в `src/modules/assistant/services/shortlist-builder.service.ts` — зависит от T027
- [X] T029 [US3] Учесть `calories_max` в проверке пригодности в `src/modules/suggestions/services/suggestion-eligibility.service.ts`, чтобы подсказка «полегче» скрывалась при отсутствии подходящих товаров — зависит от T027, T013
- [X] T030 [P] [US3] Добавить 6 подсказок по диете и исключениям в `seeds/suggestions.seed.ts` (`no_fish`, `no_spicy_at_all`, `no_cucumber`, `no_cream_cheese`, `light_calories`, `veggie_only`) по таблице [data-model.md](./data-model.md), каждой — `fallbackPayload` с текстом и `quick_replies` (FR-007)
- [X] T031 [P] [US3] Добавить 11 сценарных подсказок в `seeds/suggestions.seed.ts` (`for_two`, `office_lunch`, `big_party`, `birthday`, `drinks`, `sauces_addons`, `baked_rolls`, `best_value`, `premium_choice`, `with_tuna`, `with_eel`), каждой — `fallbackPayload` с текстом и `quick_replies` (FR-007)
- [X] T032 [P] [US3] Добавить 3 подсказки «похож на X» в `seeds/suggestions.seed.ts` (`like_california`, `like_dragon`, `like_canada`) с `excluded_product_names` на образец и `fallbackPayload` (FR-007)
- [X] T033 [US3] Проверить порог `calories_max` подсказки `light_calories` на боевых данных Тюмени и зафиксировать итог в [research.md](./research.md) (R7): единица измерения `products.calories` и выбранное значение; критерий приёмки — подсказка возвращает не менее 5 карточек в Тюмени — зависит от T030

**Checkpoint**: каталог ≥49 подсказок, все новые дают непустой результат или скрываются

---

## Phase 6: User Story 4 - Подсказки под экран, время суток и город (Priority: P3)

**Goal**: состав набора зависит от контекста экрана, части суток и города.

**Independent Test**: сравнить наборы для `catalog`/`cart`/`checkout`/`unknown` и в обеденное против вечернего окна (сценарии 5 и 6 [quickstart.md](./quickstart.md)).

### Tests for User Story 4

- [X] T034 [P] [US4] Юнит-тест части суток в `src/modules/suggestions/tests/day-part.spec.ts`: границы окон, интервал через полночь, карта сценариев (`lunch`, `dinner`/`evening`/`movie`), сценарий без карты и его отсутствие → множитель 1
- [X] T035 [P] [US4] Юнит-тест множителей и нижней границы мест в `src/modules/suggestions/tests/suggestion-selector.spec.ts` (дополнить): свойства 3a и 6 из [contracts/selection-algorithm.md](./contracts/selection-algorithm.md) — в `cart` дополнения занимают ≥4 из 6 мест, в `checkout`/`empty` то же для сервисных, при нехватке профильных берутся все доступные

### Implementation for User Story 4

- [X] T036 [P] [US4] Реализовать `src/modules/suggestions/services/day-part.service.ts`: текущая часть суток по `SUGGESTIONS_TIMEZONE` через `Intl.DateTimeFormat`, окна из `SUGGESTIONS_DAYPART_WINDOWS`, сопоставление сценария подсказки — зависит от T001
- [X] T037 [US4] Добавить `dayPartFactor`, `contextFactor` и нижнюю границу мест для профильных подсказок контекста (`ceil(2/3 * limit)`, FR-019, FR-020) в `src/modules/suggestions/services/suggestion-selector.service.ts` по [contracts/selection-algorithm.md](./contracts/selection-algorithm.md) — зависит от T036, T012
- [X] T038 [US4] Прокинуть часть суток и контекст из `src/modules/suggestions/services/suggestion.service.ts` в отбор, зарегистрировать `DayPartService` в `src/modules/suggestions/suggestions.module.ts` — зависит от T036, T037
- [X] T039 [P] [US4] Проставить контексты в `seeds/suggestions.seed.ts`: `screenContexts: ['catalog','cart']` для `dessert`, `hot_food`, `drinks`, `sauces_addons`; явный `['catalog']` остальным товарным; сервисным — `['catalog','checkout','empty']`
- [X] T040 [US4] Дополнить интеграционный тест `test/integration/suggestions-selection.test.ts`: в `cart` дополнения занимают ≥4 из 6 мест, в `checkout` сервисные — ≥4 из 6, `unknown` эквивалентен `catalog`, подсказка с `allowed_br` в чужом городе не показывается — зависит от T038, T039

**Checkpoint**: набор уместен по месту и времени

---

## Phase 7: User Story 5 - Порядок по накопленной статистике (Priority: P3)

**Goal**: доля выборов за 30 дней влияет на частоту попадания подсказки в набор; при пустой статистике порядок задаёт администратор.

**Independent Test**: набить показы и клики по одной подсказке выше порога и сравнить частоту её попадания на 50 разных `session_id` до и после (сценарий 9 [quickstart.md](./quickstart.md)).

### Tests for User Story 5

- [X] T041 [P] [US5] Юнит-тест статистики в `src/modules/suggestions/tests/suggestion-stats.spec.ts`: агрегат по типам событий и периоду, разрез `rn`+`target`, кеш TTL, сбой запроса → пустая статистика
- [X] T042 [P] [US5] Юнит-тест влияния статистики в `src/modules/suggestions/tests/suggestion-selector.spec.ts` (дополнить): свойства 5 и 7 — высокий достоверный CTR попадает чаще; подсказка без показов всё равно попадает; показы ниже порога не меняют порядок относительно `sort_order`

### Implementation for User Story 5

- [X] T043 [US5] Реализовать `src/modules/suggestions/services/suggestion-stats.service.ts`: агрегирующий запрос по `assistant_suggestion_events` с `count(*) filter` по `suggestion_shown`/`suggestion_clicked` за `SUGGESTIONS_STATS_WINDOW_DAYS`, кеш в памяти TTL 60 с на `rn|target`, деградация в пустую статистику — зависит от T001
- [X] T044 [US5] Добавить `ctrFactor` с порогом достоверности и бонусом исследования в `src/modules/suggestions/services/suggestion-selector.service.ts` — зависит от T043, T012
- [X] T045 [US5] Подключить статистику в `src/modules/suggestions/services/suggestion.service.ts` и зарегистрировать сервис в `src/modules/suggestions/suggestions.module.ts` — зависит от T043, T044
- [X] T046 [US5] Дополнить интеграционный тест `test/integration/suggestions-selection.test.ts`: пустая таблица событий → порядок по `sort_order`; подготовленные события с высоким CTR → сдвиг частоты — зависит от T045

**Checkpoint**: все пять историй работают независимо

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T047 [P] Добавить ADR-013 (отбор взвешенной выборкой с seed от сессии), ADR-014 (пригодность сервисной подсказки по базе знаний), ADR-015 (время суток через сценарий) в `docs/knowledge/decisions.md`
- [X] T048 [P] Обновить `docs/knowledge/architecture.md` и `docs/knowledge/modules.md`: новый состав модуля `suggestions`, путь отбора набора, связь с `site-knowledge` и событиями
- [X] T049 [P] Описать новый параметр `session_id`, контексты экрана и поле `kind` в Swagger-аннотациях и в разделе подсказок `README.md`
- [X] T050 Прогнать `pnpm lint` и `pnpm format`
- [X] T051 Прогнать `pnpm test` (юнит + интеграционные) и убедиться, что падений нет
- [X] T052 (частично: сценарии 6 и 9 закрыты тестами, не стендом) Выполнить сценарии 1–10 из [quickstart.md](./quickstart.md) на локальном стенде с базой знаний Тюмени и зафиксировать результаты в `specs/012-suggestions-mix/quickstart.md` (раздел с итогами прогона)
- [X] T053 Замерить латентность `GET /v1/assistant/suggestions` на каталоге 49 подсказок (прогрев кешей + 200 запросов с разными `session_id`), зафиксировать p95 в `specs/012-suggestions-mix/quickstart.md`; критерий SC-006 — p95 ≤ 300 мс
- [ ] T054 (НЕ ЗАКРЫТО: нужен прод — локально в `ai_logs` только записи прогона) Снять базовую линию до раскатки и контрольный замер после: доля запросов с отказом «вопрос не поддерживается» по `ai_logs` (SC-003) и доля выборов подсказок с пустым ответом по `assistant_suggestion_events` (SC-004); оба числа зафиксировать в `specs/012-suggestions-mix/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: без зависимостей
- **Foundational (Phase 2)**: после Setup; блокирует все истории
- **US1 (Phase 3)**: после Foundational — MVP
- **US2 (Phase 4)**: после Foundational; переиспользует `SuggestionEligibilityService` из US1 (T013), поэтому практический порядок US1 → US2
- **US3 (Phase 5)**: после Foundational; не зависит от US1/US2 (правит каталог и фильтры подбора)
- **US4 (Phase 6)**: после US1 (множители добавляются в существующий расчёт веса)
- **US5 (Phase 7)**: после US1 (та же причина)
- **Polish (Phase 8)**: после всех реализованных историй

### User Story Dependencies

- **US1 (P1)**: самостоятельна, даёт MVP на текущем каталоге
- **US2 (P2)**: самостоятельно тестируема; полный смысл квоты типов проявляется вместе с US1
- **US3 (P2)**: полностью независима — можно вести параллельно с US1 другим исполнителем
- **US4 (P3)**: требует готового расчёта веса из US1
- **US5 (P3)**: требует готового расчёта веса из US1; наполняется данными только после доработки клиента (события показов)

### Within Each User Story

- Тесты пишутся до реализации и сначала падают
- Схема и общие типы → сервисы → сервис-оркестратор → контроллер
- Сид правится после того, как поля схемы существуют

### Parallel Opportunities

- Phase 1: T002, T003, T004 параллельно (T001 отдельно — общий файл конфигурации)
- Phase 2: T007, T008, T009 параллельно после T005/T006
- Phase 3: T010 и T011 параллельно
- Phase 5 целиком параллельна Phase 3: T025–T027, T030–T032 независимы (разные файлы; задачи по `seeds/suggestions.seed.ts` — один файл, поэтому между собой последовательно)
- Phase 8: T047, T048, T049 параллельно

## Parallel Example: User Story 1

```text
Одновременно (разные файлы, нет взаимных зависимостей):
  T010 src/modules/suggestions/tests/suggestion-selector.spec.ts
  T011 src/modules/suggestions/tests/suggestion-eligibility.spec.ts

Затем последовательно:
  T012 → T013 → T014 → T015 → T016 → T017
```

## Implementation Strategy

1. **MVP = Phase 1 + Phase 2 + Phase 3 (US1)**: экран получает 6 подсказок с ротацией; попутно устранены три дефекта текущего отбора. Поставляется и проверяется само по себе.
2. **Инкремент 2 = US2 + US3**: каталог вырастает до 49 подсказок, причём порционный показ уже защищает экран от их числа. Эти две истории можно вести параллельно.
3. **Инкремент 3 = US4 + US5**: уместность по контексту и времени, затем самонастройка по статистике. US5 даёт эффект только после доработки клиента (отправка `suggestion_shown` по каждой показанной подсказке) — зависимость зафиксирована в [contracts/suggestions-list.md](./contracts/suggestions-list.md).
