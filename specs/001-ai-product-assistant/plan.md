# Implementation Plan: AI Product Assistant — MVP Backend

**Branch**: `001-ai-product-assistant` | **Date**: 2026-06-26 | **Spec**: [spec.md](./spec.md)

---

## Summary

Standalone backend-сервис на TypeScript + NestJS, который отвечает на вопросы пользователей по товарам каталога доставки роллов. Сервис импортирует каталог из внешнего API, хранит нормализованные товары в PostgreSQL + pgvector, использует RAG для поиска релевантных кандидатов и подключаемый LLM-провайдер для генерации ответа. LLM заменяема через интерфейс; в MVP используется mock. Все ответы проходят валидатор. Преднастроенные подсказки хранятся как объекты с payload, не как статический текст.

---

## Technical Context

| Параметр | Значение |
|---|---|
| Language | TypeScript 5.x |
| Runtime | Node.js 22 LTS |
| Framework | NestJS 10 (модульность, DI, OpenAPI из коробки) |
| HTTP | Fastify adapter (производительность) |
| ORM | Drizzle ORM (type-safe, migration-first) |
| Database | PostgreSQL 16 + pgvector 0.7 |
| Cache | — (опционально Redis для session store в будущем) |
| Testing | Vitest + supertest |
| Linting | ESLint + Prettier |
| Container | Docker Compose |
| OpenAPI | @nestjs/swagger |
| Package manager | pnpm |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       NestJS Application                        │
│                                                                 │
│  ┌──────────────┐  ┌─────────────────────────────────────────┐ │
│  │  HTTP Layer   │  │              Modules                    │ │
│  │  (Fastify)    │  │                                         │ │
│  │               │  │  catalog-import  catalog  rag           │ │
│  │  /v1/assistant│  │  assistant       suggestions analytics  │ │
│  │  /v1/internal │  │  admin-config                           │ │
│  └──────────────┘  └─────────────────────────────────────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Infrastructure                          │   │
│  │  DrizzleModule  │  LLMProviderModule  │  EmbeddingModule│   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
           │                      │
   ┌───────▼───────┐      ┌───────▼──────────────┐
   │  PostgreSQL 16 │      │  External Catalog API │
   │  + pgvector    │      │  (mock in dev/test)  │
   └───────────────┘      └──────────────────────┘
```

---

## Module Boundaries

### 1. `catalog-import` module
**Ответственность**: загрузка данных из внешнего API, нормализация, сохранение.

Сервисы:
- `CityImportService` — импорт городов из `/v1/cities?rn={rn}`
- `ProductImportService` — импорт товаров по категории / по ids / полный
- `ProductNormalizerService` — нормализация raw payload в схему БД
- `ImportJobService` — управление статусами import_jobs

Провайдеры:
- `CatalogApiClient` — HTTP-клиент к внешнему API (с mock-режимом)
- `CatalogApiMockClient` — возвращает фиктивные данные в dev/test

Endpoints (internal):
- `POST /v1/internal/import/cities`
- `POST /v1/internal/import/products`
- `POST /v1/internal/import/products/by-ids`

---

### 2. `catalog` module
**Ответственность**: чтение каталога товаров с фильтрами.

Сервисы:
- `CatalogService` — получение товаров по `br`, фильтрация по доступности, цене, категории, ингредиентам, тегам
- `ProductLookupService` — fuzzy search по названию, lookup по `product_id`

---

### 3. `rag` module
**Ответственность**: подготовка текстов, embeddings, hybrid retrieval.

Сервисы:
- `SearchableTextBuilder` — генерирует `searchable_text` из полей товара
- `EmbeddingService` — interface + mock/real провайдер
- `VectorSearchService` — cosine similarity с metadata filters через pgvector
- `KeywordSearchService` — keyword fallback
- `HybridRetriever` — объединяет vector + keyword, scoring

Интерфейс провайдера:
```typescript
interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  modelName(): string;
  dimensions(): number;
}
```

---

### 4. `assistant` module
**Ответственность**: основной pipeline запроса к ассистенту.

Сервисы:
- `IntentSlotParser` — извлекает intent и slots из `user_message`
- `ShortlistBuilder` — запускает hybrid retrieval с фильтрами из slots
- `LLMService` — interface + mock/real провайдер
- `ResponseValidator` — валидирует LLM-ответ по 12 правилам
- `FallbackService` — генерирует fallback при отсутствии результатов
- `AssistantOrchestrator` — координирует весь pipeline

Интерфейс LLM-провайдера:
```typescript
interface LLMProvider {
  parseIntent(message: string, context: IntentContext): Promise<IntentResult>;
  rerankAndAnswer(request: RerankerInput): Promise<LLMResponse>;
}
```

Endpoints:
- `POST /v1/assistant/product-answer`
- `POST /v1/assistant/feedback`

---

### 5. `suggestions` module
**Ответственность**: список подсказок, проверка доступности, обработка клика.

Сервисы:
- `SuggestionService` — загрузка, фильтрация, проверка availability
- `SuggestionToSlots` — преобразует payload в intent + slots для pipeline

Endpoints:
- `GET /v1/assistant/suggestions`

---

### 6. `analytics` module
**Ответственность**: запись событий, без блокировки основного pipeline.

Сервисы:
- `AnalyticsService` — fire-and-forget запись событий
- `EventTypes` — enum событий

Endpoints:
- `POST /v1/assistant/events`

---

### 7. `admin-config` module
**Ответственность**: seed подсказок, настройки ассистента, banned phrases.

Сервисы:
- `AdminRulesService` — чтение/обновление admin_rules
- `SuggestionAdminService` — CRUD подсказок

Endpoints:
- `GET /v1/internal/assistant/suggestions`
- `POST /v1/internal/assistant/suggestions`
- `PATCH /v1/internal/assistant/suggestions/:id`

---

## Project Structure

```
.
├── docs/
│   └── technical_design_ai_product_assistant.md
├── specs/
│   └── 001-ai-product-assistant/
│       ├── spec.md
│       ├── plan.md
│       ├── tasks.md
│       └── checklists/
│           └── requirements.md
├── src/
│   ├── main.ts                          # NestJS bootstrap (Fastify)
│   ├── app.module.ts
│   ├── common/
│   │   ├── filters/                     # Global exception filters
│   │   ├── interceptors/                # Logging, latency
│   │   ├── pipes/                       # Validation pipe
│   │   └── dto/                         # Shared DTOs (ErrorDto, etc.)
│   ├── config/
│   │   └── configuration.ts             # env schema (zod)
│   ├── database/
│   │   ├── database.module.ts
│   │   ├── schema/                      # Drizzle table definitions
│   │   │   ├── retail-networks.ts
│   │   │   ├── cities.ts
│   │   │   ├── products.ts
│   │   │   ├── city-products.ts
│   │   │   ├── product-chunks.ts
│   │   │   ├── product-embeddings.ts
│   │   │   ├── assistant-sessions.ts
│   │   │   ├── ai-logs.ts
│   │   │   ├── assistant-suggestions.ts
│   │   │   ├── suggestion-events.ts
│   │   │   ├── admin-rules.ts
│   │   │   └── import-jobs.ts
│   │   └── migrations/                  # Drizzle migration files
│   ├── modules/
│   │   ├── catalog-import/
│   │   │   ├── catalog-import.module.ts
│   │   │   ├── services/
│   │   │   │   ├── city-import.service.ts
│   │   │   │   ├── product-import.service.ts
│   │   │   │   ├── product-normalizer.service.ts
│   │   │   │   └── import-job.service.ts
│   │   │   ├── clients/
│   │   │   │   ├── catalog-api.client.ts
│   │   │   │   └── catalog-api-mock.client.ts
│   │   │   └── controllers/
│   │   │       └── import.controller.ts
│   │   ├── catalog/
│   │   │   ├── catalog.module.ts
│   │   │   ├── services/
│   │   │   │   ├── catalog.service.ts
│   │   │   │   └── product-lookup.service.ts
│   │   │   └── dto/
│   │   ├── rag/
│   │   │   ├── rag.module.ts
│   │   │   ├── services/
│   │   │   │   ├── searchable-text-builder.service.ts
│   │   │   │   ├── embedding.service.ts
│   │   │   │   ├── vector-search.service.ts
│   │   │   │   ├── keyword-search.service.ts
│   │   │   │   └── hybrid-retriever.service.ts
│   │   │   ├── providers/
│   │   │   │   ├── embedding.provider.interface.ts
│   │   │   │   ├── mock-embedding.provider.ts
│   │   │   │   └── openai-embedding.provider.ts
│   │   │   └── types.ts
│   │   ├── assistant/
│   │   │   ├── assistant.module.ts
│   │   │   ├── services/
│   │   │   │   ├── intent-slot-parser.service.ts
│   │   │   │   ├── shortlist-builder.service.ts
│   │   │   │   ├── llm.service.ts
│   │   │   │   ├── response-validator.service.ts
│   │   │   │   ├── fallback.service.ts
│   │   │   │   └── assistant-orchestrator.service.ts
│   │   │   ├── providers/
│   │   │   │   ├── llm.provider.interface.ts
│   │   │   │   ├── mock-llm.provider.ts
│   │   │   │   └── openai-llm.provider.ts
│   │   │   ├── controllers/
│   │   │   │   └── assistant.controller.ts
│   │   │   ├── dto/
│   │   │   │   ├── product-answer.request.dto.ts
│   │   │   │   ├── product-answer.response.dto.ts
│   │   │   │   └── feedback.dto.ts
│   │   │   └── types.ts
│   │   ├── suggestions/
│   │   │   ├── suggestions.module.ts
│   │   │   ├── services/
│   │   │   │   ├── suggestion.service.ts
│   │   │   │   └── suggestion-to-slots.service.ts
│   │   │   ├── controllers/
│   │   │   │   └── suggestions.controller.ts
│   │   │   └── dto/
│   │   ├── analytics/
│   │   │   ├── analytics.module.ts
│   │   │   ├── services/
│   │   │   │   └── analytics.service.ts
│   │   │   ├── controllers/
│   │   │   │   └── events.controller.ts
│   │   │   └── dto/
│   │   └── admin-config/
│   │       ├── admin-config.module.ts
│   │       ├── services/
│   │       │   ├── admin-rules.service.ts
│   │       │   └── suggestion-admin.service.ts
│   │       └── controllers/
│   │           └── suggestion-admin.controller.ts
│   └── healthcheck/
│       └── health.controller.ts
├── test/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── seeds/
│   └── suggestions.seed.ts
├── docker/
│   └── postgres/
│       └── init.sql                     # pgvector extension
├── docker-compose.yml
├── docker-compose.test.yml
├── .env.example
├── .env.test
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vitest.config.ts
├── eslint.config.js
├── .prettierrc
└── README.md
```

---

## Database Schema Summary

### Ключевые решения:
- `products` — глобальная карточка (без цены). Уникальный ключ: `(rn, external_product_id)`.
- `city_products` — городовая проекция: цена, наличие, target. Уникальный ключ: `(rn, br, target, product_id)`.
- `product_chunks` — один chunk на товар × город; `searchable_text` в виде ТЕКСТА; `metadata` JSONB.
- `product_embeddings` — VECTOR(1536), связан с chunk через chunk_id.
- `assistant_suggestions` — `payload` JSONB (intent + slots + retrieval_query), `availability_rules` JSONB.

### Индексы:
```sql
-- Fast city-filtered product lookup
CREATE INDEX idx_city_products_br_available ON city_products(rn, br, target, is_available, is_valid);
CREATE INDEX idx_city_products_price ON city_products(price) WHERE is_available = true;

-- Vector search
CREATE INDEX idx_product_embeddings_vector ON product_embeddings USING ivfflat (embedding vector_cosine_ops);

-- Suggestions lookup
CREATE INDEX idx_suggestions_rn_enabled ON assistant_suggestions(rn, enabled, target);

-- AI logs
CREATE INDEX idx_ai_logs_session ON ai_logs(session_id, created_at);
CREATE INDEX idx_ai_logs_created ON ai_logs(created_at DESC);
```

---

## Migration Strategy

- Drizzle ORM migrations в `src/database/migrations/`.
- Команда: `pnpm db:migrate` (drizzle-kit migrate).
- `pnpm db:generate` для генерации новых миграций из схемы.
- В Docker Compose: отдельный `migrate` сервис запускается перед `app`.
- pgvector extension: `CREATE EXTENSION IF NOT EXISTS vector;` в `docker/postgres/init.sql`.

---

## LLM Provider Abstraction

```typescript
// Intent parsing
interface LLMProvider {
  parseIntent(payload: IntentParseInput): Promise<IntentResult>;
  rerankAndAnswer(payload: RerankerInput): Promise<LLMRerankerResult>;
}

// Mock implementation
class MockLLMProvider implements LLMProvider {
  async parseIntent(payload): Promise<IntentResult> {
    return {
      intent: 'product_recommendation',
      slots: { budget_max: this.extractBudget(payload.message) },
      need_clarification: false,
      confidence: 0.9,
    };
  }
  async rerankAndAnswer(payload): Promise<LLMRerankerResult> {
    // Returns first N candidates from shortlist as-is
    return { selected: payload.candidates.slice(0, 3), reply_text: '...' };
  }
}
```

Переключение через `LLM_PROVIDER=mock|openai` в `.env`.

---

## Embedding Provider Abstraction

```typescript
interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  modelName(): string;
  dimensions(): number;
}

// Mock: deterministic hash-based pseudo-vector
class MockEmbeddingProvider implements EmbeddingProvider {
  dimensions() { return 1536; }
  modelName() { return 'mock-embedding-v1'; }
  async embed(text: string): Promise<number[]> {
    // Детерминированный вектор на основе хэша текста
    return deterministicVector(text, 1536);
  }
}
```

Переключение через `EMBEDDING_PROVIDER=mock|openai` в `.env`.

---

## API Validation & Error Format

Все входящие запросы валидируются через `class-validator` + `ValidationPipe` NestJS.

Единый формат ошибок:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "br is required",
    "details": [...]
  }
}
```

HTTP статусы: 400 (validation), 404 (not found), 422 (business rule violation), 500 (internal).

---

## Import Pipeline Details

```
CityImportService:
  1. GET /v1/cities?rn={rn}
  2. Нормализация: { id, rn, br, name, is_active, raw_payload, imported_at }
  3. db.upsert(cities, conflictTarget: [rn, br])
  4. importJobs.create({ type: 'city_import', status: 'success', stats })

ProductImportService (full):
  1. Load active cities from DB
  2. For each br × category_id:
     GET /v1/products?rn=...&br=...&cat=...&withArchive=false
  3. Normalize each product → products + city_products
  4. Mark absent products as is_available=false
  5. Trigger searchable_text build + embedding queue
  6. importJobs.update({ status: 'success', stats })

Error handling:
  - 5xx → retry 3x with exponential backoff
  - 4xx → fail fast, log config error
  - Empty list → mark job as 'suspicious', keep old data
  - Invalid price/composition → is_valid=false
```

---

## RAG Pipeline Details

```
SearchableTextBuilder:
  Input: product + city_product
  Output: "Название: ...\nКатегория: ...\nСостав: ...\nАллергены: ...\nТеги: ...\n
           Вес: ...г\nКусочки: ...\nКБЖУ: ... ккал\nЦена: ... RUB\nГород: ...\nДоступность: доступен"

HybridRetriever:
  1. Embed query (mock or real)
  2. Vector search (pgvector cosine_similarity, top_k=50)
  3. Keyword search (full-text on searchable_text)
  4. Merge + deduplicate candidates
  5. Pre-filter: br, target, is_available, is_valid, price <= budget, excluded_ingredients
  6. Score: semantic*35 + keyword*20 + slot_match*25 + availability*10 + priority*5 + popularity*5
  7. Return top 30 candidates

Scoring slot_match:
  - category match: +20
  - preferred_ingredients present: +15 per ingredient (cap 40)
  - excluded_ingredients absent: required (filter)
  - spicy=false and no spicy tags: +10
  - price within budget: required (filter) + +5 if well below budget
```

---

## Validator Details

```typescript
class ResponseValidator {
  async validate(response: LLMResponse, context: ValidationContext): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    for (const card of response.cards) {
      // 1. product_id exists
      const product = await this.catalogService.findByIdInCity(card.product_id, context.rn, context.br, context.target);
      if (!product) errors.push({ code: 'PRODUCT_NOT_FOUND', product_id: card.product_id });

      // 2. product available
      if (!product?.is_available) errors.push({ code: 'PRODUCT_UNAVAILABLE' });

      // 3. price matches DB
      if (product && card.price !== product.price) errors.push({ code: 'PRICE_MISMATCH' });

      // 4. name matches DB
      if (product && card.name !== product.name) errors.push({ code: 'NAME_MISMATCH' });

      // 5. product in shortlist
      if (!context.shortlistIds.includes(card.product_id)) errors.push({ code: 'NOT_IN_SHORTLIST' });

      // 6. budget constraint
      if (context.slots.budget_max && product && product.price > context.slots.budget_max)
        errors.push({ code: 'BUDGET_EXCEEDED' });

      // 7. excluded ingredients
      for (const ing of context.slots.excluded_ingredients ?? []) {
        if (product?.ingredients?.includes(ing)) errors.push({ code: 'EXCLUDED_INGREDIENT' });
      }
    }

    // 8. Text checks
    this.validateText(response.reply_text, context, errors);

    return { valid: errors.length === 0, errors };
  }
}
```

---

## Seed: Initial Suggestions

При первом запуске через `pnpm db:seed` создаются 21 подсказка из раздела 10.1 ТЗ:
`first_try`, `popular_rolls`, `no_meat`, `company_set`, `for_series`, `spicy`, `shrimp_rolls`, `under_1000`, `perfect_dinner`, `gift_sushi_fan`, `like_philadelphia`, `only_salmon`, `tender_rolls`, `lunch`, `quick_snack`, `evening`, `avocado`, `for_kids`, `hot_food`, `dessert`, `new_items`.

---

## Analytics Events

Все события пишутся fire-and-forget (не блокируют response):
- `suggestion_shown` — при каждом `GET /suggestions`
- `suggestion_clicked` — при `POST /product-answer` с `suggestion_id`
- `products_returned` — при успешном ответе с карточками
- `empty_result` — при пустом shortlist
- `product_card_clicked`, `add_to_cart`, `feedback_like/dislike` — из `POST /events`

---

## Tests Strategy

| Тип | Фреймворк | Что покрываем |
|---|---|---|
| Unit | Vitest | IntentSlotParser, ResponseValidator, SearchableTextBuilder, FallbackService, SuggestionService availability check |
| Integration | Vitest + testcontainers (postgres) | ImportService, CatalogService, HybridRetriever, AssistantOrchestrator с mock LLM |
| e2e | Vitest + supertest | Full request flows через HTTP |
| Golden | Vitest | Фиксированные запросы → ожидаемые свойства ответа |

---

## Environment Variables

```env
# App
NODE_ENV=development
PORT=3000
API_PREFIX=/v1

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/ai_assistant

# External APIs
CATALOG_API_BASE_URL=https://venus-api-catalog2.apps-web.net
CITIES_API_BASE_URL=https://venus-api-backend2.apps-web.net
CATALOG_API_MODE=mock          # mock | real

# LLM
LLM_PROVIDER=mock              # mock | openai
OPENAI_API_KEY=

# Embeddings
EMBEDDING_PROVIDER=mock        # mock | openai
EMBEDDING_MODEL=text-embedding-3-small

# Assistant config
DEFAULT_RN=A79C5050-1EE7-11EB-9B6E-05B5FC40DF2A
MAX_CANDIDATES_FOR_LLM=30
MAX_CARDS_IN_RESPONSE=5
LLM_TIMEOUT_MS=6000
SESSION_TTL_MINUTES=60

# Suggestions
MAX_SUGGESTIONS_ON_SCREEN=8
HIDE_EMPTY_SUGGESTIONS=true

# Internal API auth (simple key для MVP)
INTERNAL_API_KEY=dev-internal-key-change-in-prod
```

---

## Local Run Instructions

```bash
# 1. Prerequisites: Docker Desktop, Node.js 22, pnpm
# 2. Clone / open project
cd aiHelper

# 3. Install deps
pnpm install

# 4. Start infrastructure
docker-compose up -d postgres

# 5. Run migrations
pnpm db:migrate

# 6. Seed suggestions
pnpm db:seed

# 7. Start app (dev mode)
pnpm start:dev

# 8. Verify
curl http://localhost:3000/health
curl "http://localhost:3000/v1/assistant/suggestions?rn=A79C5050-1EE7-11EB-9B6E-05B5FC40DF2A&br=test-city&target=WEB"

# Run tests
pnpm test              # unit + integration
pnpm test:e2e          # e2e
pnpm test:coverage     # with coverage
```

---

## Vertical Slice (Milestone 8 goal)

Минимальный e2e сценарий:
1. `pnpm db:seed` создаёт seed-город и seed-товары.
2. `POST /product-answer` с `{"city_id":"test_city","user_message":"Хочу роллы с лососем до 1000 рублей","target":"WEB"}`.
3. Ответ содержит карточки с `price <= 1000`, с лососем в ингредиентах.
4. Все `product_id` из ответа существуют в `city_products`.
5. `ai_logs` содержит запись с `request_id`.

---

## Constitution Check

| Принцип | Статус |
|---|---|
| LLM не является источником фактов | ✅ Валидатор проверяет все факты по БД |
| Нет истории заказов | ✅ Ни в одном сервисе/таблице нет user history |
| LLM заменяема | ✅ Interface + Mock + Real через env |
| Embedding заменяем | ✅ Interface + Mock + Real через env |
| Городовой фильтр до LLM | ✅ В ShortlistBuilder/HybridRetriever |
| Подсказки — не свободный текст | ✅ Payload подсказки, не text |
| Все секреты в env | ✅ Конфиг через zod env schema |
| Schema validation публичных API | ✅ class-validator ValidationPipe |
