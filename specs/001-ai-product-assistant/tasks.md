# Tasks: AI Product Assistant — MVP Backend

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-06-26

---

## Milestone 0: Project Bootstrap

**Goal**: Рабочая заготовка проекта — стек, Docker, миграции, тесты запускаются.

**Checkpoint**: `docker-compose up` поднимает PostgreSQL; `pnpm test` проходит (0 тестов, 0 ошибок); `pnpm start:dev` запускает сервер.

- [ ] T001 [P] Инициализировать NestJS проект с Fastify adapter: `pnpm create @nestjs/project`, настроить `tsconfig.json`, `package.json`
  - **Files**: `package.json`, `tsconfig.json`, `src/main.ts`, `src/app.module.ts`
  - **Done when**: `pnpm start` запускается без ошибок
  - **Deps**: —

- [ ] T002 [P] Добавить Drizzle ORM, Vitest, class-validator, @nestjs/swagger, zod
  - **Files**: `package.json`, `vitest.config.ts`, `eslint.config.js`, `.prettierrc`
  - **Done when**: все зависимости установлены, `pnpm lint` проходит
  - **Deps**: T001

- [ ] T003 [P] Создать `docker-compose.yml` с PostgreSQL 16 + pgvector, `docker-compose.test.yml` для тестов
  - **Files**: `docker-compose.yml`, `docker-compose.test.yml`, `docker/postgres/init.sql` (CREATE EXTENSION vector)
  - **Done when**: `docker-compose up -d postgres` запускает БД, `psql -c "SELECT extversion FROM pg_extension WHERE extname='vector'"` возвращает версию
  - **Deps**: —

- [ ] T004 Создать конфигурацию env через zod: `src/config/configuration.ts`, `.env.example`, `.env.test`
  - **Files**: `src/config/configuration.ts`, `.env.example`, `.env.test`
  - **Done when**: приложение завершается с понятной ошибкой при отсутствии обязательных env; `CONFIG_MODULE` работает в тестах
  - **Deps**: T001

- [ ] T005 [P] Настроить global exception filter, ValidationPipe, единый формат ошибок
  - **Files**: `src/common/filters/http-exception.filter.ts`, `src/common/pipes/validation.pipe.ts`, `src/common/dto/error.dto.ts`
  - **Done when**: невалидный запрос возвращает `{"error":{"code":"VALIDATION_ERROR","message":"..."}}` со статусом 400
  - **Deps**: T001

- [ ] T006 Создать DatabaseModule с Drizzle, `pnpm db:generate` и `pnpm db:migrate` скриптами
  - **Files**: `src/database/database.module.ts`, `drizzle.config.ts`
  - **Done when**: `pnpm db:migrate` применяет пустую миграцию без ошибок
  - **Deps**: T002, T003

- [ ] T007 [P] Создать `/health` endpoint
  - **Files**: `src/healthcheck/health.controller.ts`
  - **Done when**: `GET /health` возвращает `{"status":"ok"}` и `{"status":"db_ok"}` с проверкой соединения
  - **Deps**: T001, T006

- [ ] T008 [P] Добавить `README.md` с local run инструкцией
  - **Files**: `README.md`
  - **Done when**: новый разработчик может запустить проект по README без дополнительных вопросов
  - **Deps**: T003

---

## Milestone 1: Data Model

**Goal**: Все таблицы созданы в БД, индексы применены, seed подсказок загружен.

**Checkpoint**: `pnpm db:migrate && pnpm db:seed` завершаются без ошибок; `SELECT COUNT(*) FROM assistant_suggestions` возвращает 21.

- [ ] T101 Создать Drizzle схемы всех таблиц
  - **Files**:
    - `src/database/schema/retail-networks.ts`
    - `src/database/schema/cities.ts`
    - `src/database/schema/products.ts`
    - `src/database/schema/city-products.ts`
    - `src/database/schema/product-chunks.ts`
    - `src/database/schema/product-embeddings.ts`
    - `src/database/schema/assistant-sessions.ts`
    - `src/database/schema/ai-logs.ts`
    - `src/database/schema/assistant-suggestions.ts`
    - `src/database/schema/suggestion-events.ts`
    - `src/database/schema/admin-rules.ts`
    - `src/database/schema/import-jobs.ts`
    - `src/database/schema/index.ts`
  - **Done when**: `pnpm db:generate` создаёт SQL миграцию со всеми таблицами
  - **Deps**: T006

- [ ] T102 Создать и применить начальную миграцию с индексами и pgvector
  - **Files**: `src/database/migrations/0001_initial.sql`
  - **Done when**: `pnpm db:migrate` применяет миграцию; `\d city_products` показывает индекс на `(rn, br, target, is_available)`
  - **Tests**: проверка существования таблиц и индексов
  - **Deps**: T101

- [ ] T103 Создать seed файл с 21 подсказкой из раздела 10.1 ТЗ
  - **Files**: `seeds/suggestions.seed.ts`, `seeds/index.ts`
  - **Done when**: `pnpm db:seed` создаёт 21 запись в `assistant_suggestions` (idempotent — повторный запуск не дублирует)
  - **Tests**: unit-тест, что seed содержит все коды подсказок из ТЗ
  - **Deps**: T102

- [ ] T104 [P] Создать seed с тестовым retail_network и тестовым городом для dev/test
  - **Files**: `seeds/test-data.seed.ts`
  - **Done when**: `pnpm db:seed` создаёт `retail_networks` запись и `cities` запись с фиксированными GUID
  - **Deps**: T103

---

## Milestone 2: Import Pipeline

**Goal**: Города и товары импортируются из mock/real API и сохраняются в БД. CLI-команды работают.

**Checkpoint**: `POST /v1/internal/import/cities` → `GET /cities` в БД содержит записи. `POST /v1/internal/import/products` → `city_products` содержит товары с ценами.

- [ ] T201 Создать `CatalogApiClient` interface и `CatalogApiMockClient`
  - **Files**:
    - `src/modules/catalog-import/clients/catalog-api.client.interface.ts`
    - `src/modules/catalog-import/clients/catalog-api-mock.client.ts`
    - `src/modules/catalog-import/clients/catalog-api-http.client.ts`
  - **Done when**: mock клиент возвращает структуру, совместимую с реальным API; переключение через `CATALOG_API_MODE=mock`
  - **Tests**: unit-тест mock клиента
  - **Deps**: T006

- [ ] T202 Реализовать `ProductNormalizerService` — нормализация raw API payload в DB-схему
  - **Files**: `src/modules/catalog-import/services/product-normalizer.service.ts`
  - **Done when**: нормализатор корректно извлекает `name`, `price`, `ingredients`, `allergens`, `tags`, `calories`, `weight`, `category_id`; товары с невалидной ценой помечаются `is_valid=false`
  - **Tests**: unit-тесты на 5+ вариантов payload (нормальный, без цены, без состава, с нулевой ценой, с отсутствующими КБЖУ)
  - **Deps**: T101

- [ ] T203 Реализовать `ImportJobService` — создание, обновление, управление статусами
  - **Files**: `src/modules/catalog-import/services/import-job.service.ts`
  - **Done when**: создаёт/обновляет записи в `import_jobs` с полями `status`, `stats`, `error`
  - **Tests**: unit-тест
  - **Deps**: T101

- [ ] T204 Реализовать `CityImportService` — импорт городов с retry и upsert
  - **Files**: `src/modules/catalog-import/services/city-import.service.ts`
  - **Done when**: upsert городов, поддержка retry 3x exponential backoff, запись в `import_jobs`
  - **Tests**: integration-тест с mock API клиентом + реальной test БД
  - **Deps**: T201, T203

- [ ] T205 Реализовать `ProductImportService` — полный импорт + инкрементальный по ids
  - **Files**: `src/modules/catalog-import/services/product-import.service.ts`
  - **Done when**: полный импорт по `br × category_id`; инкрементальный по `ids`; absent товары → `is_available=false`; поддержка dry-run через `mode=dry-run`
  - **Tests**: integration-тест: после импорта mock данных `city_products` содержит товары
  - **Deps**: T202, T203, T204

- [ ] T206 Создать `ImportController` с endpoints и `CatalogImportModule`
  - **Files**:
    - `src/modules/catalog-import/controllers/import.controller.ts`
    - `src/modules/catalog-import/catalog-import.module.ts`
  - **Done when**: `POST /v1/internal/import/cities` возвращает `{"job_id":"...","status":"queued"}`; валидация тела запроса
  - **Tests**: e2e тест endpoint-ов (mock API + test DB)
  - **Deps**: T204, T205

---

## Milestone 3: Catalog Service

**Goal**: Чтение товаров по городу с фильтрами. Fuzzy lookup по названию.

**Checkpoint**: `CatalogService.findByCity(rn, br, target)` возвращает товары после импорта; фильтр `is_available=true` применяется.

- [ ] T301 Реализовать `CatalogService` — получение и фильтрация товаров по городу
  - **Files**: `src/modules/catalog/services/catalog.service.ts`
  - **Done when**: методы: `findByCity(rn, br, target, filters)` с фильтрами цены, категории, ингредиентов, тегов, острота
  - **Tests**: unit-тесты фильтрации (budget, excluded_ingredients, spicy, category)
  - **Deps**: T102

- [ ] T302 Реализовать `ProductLookupService` — fuzzy search по названию, lookup по id
  - **Files**: `src/modules/catalog/services/product-lookup.service.ts`
  - **Done when**: `findByName("Филадельфия")` возвращает точный матч и fuzzy матчи; `findById` возвращает продукт с city_products для данного br
  - **Tests**: unit-тест fuzzy search
  - **Deps**: T301

- [ ] T303 Создать `CatalogModule` и зарегистрировать сервисы
  - **Files**: `src/modules/catalog/catalog.module.ts`
  - **Deps**: T301, T302

---

## Milestone 4: RAG

**Goal**: Searchable text генерируется, mock embeddings сохраняются, hybrid retrieval возвращает релевантных кандидатов.

**Checkpoint**: После seed 5 товаров `HybridRetriever.retrieve("роллы с лососем", filters)` возвращает rolls с лососем в топе.

- [ ] T401 [P] Реализовать `SearchableTextBuilder` — генерация searchable_text из product + city_product
  - **Files**: `src/modules/rag/services/searchable-text-builder.service.ts`
  - **Done when**: строит текст по шаблону из раздела 8.1 ТЗ; обновляет `product_chunks`; content_hash для инкрементальных обновлений
  - **Tests**: unit-тест с 3 товарами разного состава
  - **Deps**: T102

- [ ] T402 Создать `EmbeddingProvider` interface и `MockEmbeddingProvider`
  - **Files**:
    - `src/modules/rag/providers/embedding.provider.interface.ts`
    - `src/modules/rag/providers/mock-embedding.provider.ts`
    - `src/modules/rag/providers/openai-embedding.provider.ts`
  - **Done when**: mock возвращает детерминированный вектор 1536 dims; тот же текст → тот же вектор; переключение через `EMBEDDING_PROVIDER`
  - **Tests**: unit-тест детерминизма
  - **Deps**: —

- [ ] T403 Реализовать `EmbeddingService` — батчевое построение и сохранение embeddings
  - **Files**: `src/modules/rag/services/embedding.service.ts`
  - **Done when**: `buildForProduct(product_id)` генерирует chunk и embedding; сохраняет в `product_embeddings`; обновляет `embedding_status` в `product_chunks`
  - **Tests**: integration-тест с mock embedding + test DB
  - **Deps**: T401, T402

- [ ] T404 Реализовать `VectorSearchService` — cosine similarity с metadata filters
  - **Files**: `src/modules/rag/services/vector-search.service.ts`
  - **Done when**: pgvector cosine search с pre-filter по `rn`, `br`, `target`, `is_available`; возвращает top_k chunk ids с scores
  - **Tests**: integration-тест с seeded embeddings
  - **Deps**: T403

- [ ] T405 Реализовать `KeywordSearchService` — keyword fallback через PostgreSQL full-text
  - **Files**: `src/modules/rag/services/keyword-search.service.ts`
  - **Done when**: `tsvector` поиск по `searchable_text`; поддержка фильтров br/target
  - **Tests**: unit-тест ключевых слов
  - **Deps**: T401

- [ ] T406 Реализовать `HybridRetriever` — объединение, scoring, shortlist
  - **Files**: `src/modules/rag/services/hybrid-retriever.service.ts`
  - **Done when**: объединяет результаты vector + keyword; применяет слот-фильтры (budget, excluded_ingredients, spicy, category); scoring по формуле 8.4 ТЗ; возвращает shortlist max 30
  - **Tests**: integration-тест: mock embeddings + seeded products → правильный shortlist
  - **Deps**: T404, T405

- [ ] T407 Создать `RagModule`, зарегистрировать сервисы
  - **Files**: `src/modules/rag/rag.module.ts`
  - **Deps**: T403, T406

---

## Milestone 5: Assistant Pipeline

**Goal**: `POST /v1/assistant/product-answer` работает end-to-end с mock LLM.

**Checkpoint**: Запрос `{"rn":"...","br":"test","target":"WEB","user_message":"Роллы с лососем до 1000"}` возвращает валидный ответ с карточками.

- [ ] T501 Реализовать `IntentSlotParser` — rule-based + mock LLM parsing
  - **Files**: `src/modules/assistant/services/intent-slot-parser.service.ts`
  - **Done when**: извлекает budget_max из текста («до 1500»); excluded_ingredients («без X»); spicy («острый/не острый»); category; product_mentions. При `LLM_PROVIDER=mock` — только rule-based. Intent: `product_recommendation`, `product_question`, `product_compare`, `product_filter`, `nutrition_question`, `allergen_question`, `unsupported`
  - **Tests**: unit-тест на 10 примеров из ТЗ
  - **Deps**: T402 (LLM interface)

- [ ] T502 Создать `LLMProvider` interface, `MockLLMProvider`, stub `OpenAILLMProvider`
  - **Files**:
    - `src/modules/assistant/providers/llm.provider.interface.ts`
    - `src/modules/assistant/providers/mock-llm.provider.ts`
    - `src/modules/assistant/providers/openai-llm.provider.ts`
  - **Done when**: mock LLM возвращает первые N кандидатов из shortlist как выбранные; `parseIntent` возвращает детерминированный ответ
  - **Tests**: unit-тест mock провайдера
  - **Deps**: —

- [ ] T503 Реализовать `ShortlistBuilder` — запуск HybridRetriever + hydration product facts
  - **Files**: `src/modules/assistant/services/shortlist-builder.service.ts`
  - **Done when**: принимает intent + slots → запускает HybridRetriever → hydrates из `city_products` → возвращает `ProductCandidate[]`
  - **Tests**: integration-тест с seeded data
  - **Deps**: T406, T301

- [ ] T504 Реализовать `ResponseValidator` — все 12 правил из spec.md
  - **Files**: `src/modules/assistant/services/response-validator.service.ts`
  - **Done when**: все 12 правил реализованы; при нарушении удаляет невалидные карточки; если все удалены — возвращает `valid=false` + `errors`
  - **Tests**: unit-тест каждого правила отдельно (12 тест-кейсов)
  - **Deps**: T301

- [ ] T505 Реализовать `FallbackService` — генерация fallback ответов
  - **Files**: `src/modules/assistant/services/fallback.service.ts`
  - **Done when**: `fallbackForUnsupported()`, `fallbackForEmptyResult(slots)`, `fallbackForLLMTimeout(topCandidates)`, `fallbackForInvalidResponse()`
  - **Tests**: unit-тест каждого типа fallback
  - **Deps**: —

- [ ] T506 Реализовать `AssistantOrchestrator` — полный pipeline
  - **Files**: `src/modules/assistant/services/assistant-orchestrator.service.ts`
  - **Done when**: координирует parser → shortlist → LLM → validator → fallback; логирует в `ai_logs`; записывает latency; обрабатывает `suggestion_id` (загружает payload из suggestions)
  - **Tests**: integration-тест: mock data → mock LLM → valid response + ai_logs запись
  - **Deps**: T501, T502, T503, T504, T505

- [ ] T507 Создать `AssistantController` с DTO, OpenAPI аннотациями
  - **Files**:
    - `src/modules/assistant/controllers/assistant.controller.ts`
    - `src/modules/assistant/dto/product-answer.request.dto.ts`
    - `src/modules/assistant/dto/product-answer.response.dto.ts`
    - `src/modules/assistant/dto/feedback.dto.ts`
  - **Done when**: `POST /v1/assistant/product-answer` и `POST /v1/assistant/feedback` работают; Swagger UI отображает схему
  - **Tests**: e2e тест happy path + невалидный запрос → 400
  - **Deps**: T506

- [ ] T508 Создать `AssistantModule`
  - **Files**: `src/modules/assistant/assistant.module.ts`
  - **Deps**: T507

---

## Milestone 6: Preset Suggestions

**Goal**: `GET /suggestions` возвращает только доступные подсказки. Клик через `suggestion_id` работает.

**Checkpoint**: `GET /suggestions?rn=...&br=test&target=WEB` возвращает ≤ 21 подсказок; только те, у которых есть доступные товары.

- [ ] T601 Реализовать `SuggestionService` — загрузка, фильтрация, availability check
  - **Files**: `src/modules/suggestions/services/suggestion.service.ts`
  - **Done when**: фильтрует по `enabled`, периоду активности, `target`, `allowed_br`; если `check_products_exist=true` — проверяет через CatalogService; лимит через `admin_rules.max_suggestions_on_screen`
  - **Tests**: unit-тест всех правил показа (enabled=false, expired, wrong target, no products)
  - **Deps**: T301, T103

- [ ] T602 Реализовать `SuggestionToSlots` — преобразование payload в intent + slots
  - **Files**: `src/modules/suggestions/services/suggestion-to-slots.service.ts`
  - **Done when**: payload подсказки корректно преобразуется в `IntentResult`; retrieval_query используется для vector search
  - **Tests**: unit-тест для 3 подсказок с разными payload
  - **Deps**: —

- [ ] T603 Создать `SuggestionsController` и `SuggestionsModule`
  - **Files**:
    - `src/modules/suggestions/controllers/suggestions.controller.ts`
    - `src/modules/suggestions/suggestions.module.ts`
    - `src/modules/suggestions/dto/suggestions-query.dto.ts`
    - `src/modules/suggestions/dto/suggestions-response.dto.ts`
  - **Done when**: `GET /v1/assistant/suggestions` возвращает корректный response
  - **Tests**: e2e тест
  - **Deps**: T601

- [ ] T604 Интеграция `suggestion_id` в `AssistantOrchestrator`
  - **Files**: `src/modules/assistant/services/assistant-orchestrator.service.ts` (update)
  - **Done when**: при `suggestion_id` в запросе загружается payload подсказки → SuggestionToSlots → стандартный RAG pipeline; записывается событие `suggestion_clicked`
  - **Tests**: integration-тест click flow
  - **Deps**: T506, T601, T602

---

## Milestone 7: Observability & Quality

**Goal**: Healthcheck, логи, аналитика событий, обработка ошибок, README с curl примерами.

**Checkpoint**: `POST /events` записывает событие в `assistant_suggestion_events`; `GET /health` возвращает статус БД.

- [ ] T701 Реализовать `AnalyticsService` и `EventsController`
  - **Files**:
    - `src/modules/analytics/services/analytics.service.ts`
    - `src/modules/analytics/controllers/events.controller.ts`
    - `src/modules/analytics/dto/event.dto.ts`
    - `src/modules/analytics/analytics.module.ts`
  - **Done when**: `POST /v1/assistant/events` записывает события в `assistant_suggestion_events`; fire-and-forget (не блокирует response); поддерживает все event_type из ТЗ
  - **Tests**: unit-тест event types validation
  - **Deps**: T102

- [ ] T702 Улучшить `HealthController` — проверка БД + pgvector
  - **Files**: `src/healthcheck/health.controller.ts`
  - **Done when**: `GET /health` включает `db: ok|error` и `pgvector: ok|error`
  - **Deps**: T006

- [ ] T703 [P] Добавить LoggingInterceptor для всех запросов
  - **Files**: `src/common/interceptors/logging.interceptor.ts`
  - **Done when**: каждый request/response логируется с `request_id`, `method`, `path`, `status`, `latency_ms`
  - **Deps**: T001

- [ ] T704 Реализовать `AdminRulesService` и `SuggestionAdminController`
  - **Files**:
    - `src/modules/admin-config/services/admin-rules.service.ts`
    - `src/modules/admin-config/services/suggestion-admin.service.ts`
    - `src/modules/admin-config/controllers/suggestion-admin.controller.ts`
    - `src/modules/admin-config/admin-config.module.ts`
  - **Done when**: CRUD для подсказок; чтение admin_rules; `X-Internal-Api-Key` auth для internal endpoints
  - **Tests**: e2e тест создания/обновления подсказки
  - **Deps**: T102

- [ ] T705 [P] Обновить README с curl примерами, описанием всех endpoint-ов
  - **Files**: `README.md`
  - **Done when**: README содержит разделы: Quick Start, API Reference с примерами curl, Environment Variables, Testing
  - **Deps**: T703

---

## Milestone 8: Final Verification

**Goal**: Все acceptance criteria из spec.md проверены. e2e happy path работает.

**Checkpoint**: Все AC-01..AC-15 зелёные.

- [ ] T801 [P] Написать golden tests для ответов ассистента
  - **Files**: `test/golden/assistant-responses.test.ts`
  - **Done when**: все 8 golden test cases из раздела 16.3 ТЗ покрыты
  - **Deps**: T507, T601

- [ ] T802 Написать e2e тест: seed → import → product-answer vertical slice
  - **Files**: `test/e2e/vertical-slice.test.ts`
  - **Done when**: весь flow: seed data → `POST /product-answer {"user_message":"Хочу роллы с лососем до 1000 рублей"}` → response содержит карточки, price ≤ 1000, все product_id существуют в БД, `ai_logs` содержит запись
  - **Deps**: T507, T401, T403

- [ ] T803 [P] Написать e2e тест empty result + suggestion fallback
  - **Files**: `test/e2e/empty-result.test.ts`
  - **Done when**: при отсутствии товаров возвращается fallback; при suggestion click без товаров → `fallback_payload` подсказки
  - **Deps**: T604

- [ ] T804 [P] Написать e2e тест import dry-run
  - **Files**: `test/e2e/import-dry-run.test.ts`
  - **Done when**: `POST /v1/internal/import/products {"mode":"dry-run"}` возвращает preview без записи в БД
  - **Deps**: T205, T206

- [ ] T805 Финальная проверка acceptance criteria AC-01..AC-15
  - **Files**: `specs/001-ai-product-assistant/checklists/requirements.md` (update)
  - **Done when**: все 15 критериев отмечены как passed в checklist
  - **Deps**: T801, T802, T803, T804

---

## Dependencies & Execution Order

```
M0 (bootstrap)
  └── M1 (data model)
        ├── M2 (import pipeline)
        │     └── M3 (catalog) ──┐
        │                        ├── M4 (RAG) ──┐
        │                        │              └── M5 (assistant) ──┐
        │                        │                                   └── M6 (suggestions)
        │                        │                                         └── M7 (observability)
        │                        │                                               └── M8 (verification)
        └── [T103 seed] ─────────┘
```

### Parallel Opportunities

- M0: T001, T003 можно начать параллельно
- M1: T101 все схемы пишутся параллельно
- M2: T201, T202 параллельно
- M4: T401, T402 параллельно
- M7: T701, T702, T703, T705 параллельно
- M8: T801, T803, T804 параллельно

---

## Scope Verification Checklist

- [x] История заказов не реализуется ни в одной задаче
- [x] Все API из ТЗ покрыты: `/product-answer`, `/suggestions`, `/feedback`, `/events`, `/import/cities`, `/import/products`, `/import/products/by-ids`, `/internal/assistant/suggestions`
- [x] RAG покрыт: T401-T407
- [x] Импорт городов покрыт: T201, T204, T206
- [x] Импорт товаров покрыт: T205, T206
- [x] Подсказки как payload-объекты: T601-T604
- [x] Fallback покрыт: T505, T505, T603
- [x] Validation покрыт: T504 (12 правил)
- [x] Acceptance criteria проверяемы: T805
- [x] Задачи упорядочены по зависимостям
