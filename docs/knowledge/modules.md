# Module Map

Feature modules live under `src/modules/`; cross-cutting code under `src/common/`, `src/database/`, `src/config/`. `AppModule` wires everything.

## Feature modules (`src/modules/`)

### `assistant/`
Owns the product-answer request pipeline (see [architecture.md](architecture.md)). Controller → `AssistantOrchestratorService` → intent parse → shortlist → LLM rerank → validate → hydrate → log. Holds the domain `LLMProvider` (mock/openai swap by `LLM_PROVIDER`), fallback responses, response validation.
- Entry: [assistant.module.ts](../../src/modules/assistant/assistant.module.ts), [assistant-orchestrator.service.ts](../../src/modules/assistant/services/assistant-orchestrator.service.ts)

### `rag/`
Retrieval. searchable-text builder, embeddings (mock/openai by `EMBEDDING_PROVIDER`), vector search (pgvector), keyword search, and the hybrid retriever that merges + scores them.
- Entry: [rag.module.ts](../../src/modules/rag/rag.module.ts), [hybrid-retriever.service.ts](../../src/modules/rag/services/hybrid-retriever.service.ts)

### `catalog/`
Product lookup / filtering by `rn` / `br` / `target` (and category, ingredients, etc.). Hydrates authoritative product + city-product data.
- Entry: [catalog.module.ts](../../src/modules/catalog/catalog.module.ts), `services/catalog.service.ts`

### `catalog-import/`
Imports cities, products, and categories from external venus APIs. `CATALOG_API_MODE` = `mock` | `real` (mock vs http client behind `catalog-api.client.interface.ts`). `ImportJobService` tracks jobs.
- **Services**: `CityImportService`, `ProductImportService`, `CategoryImportService`, `ProductNormalizerService` (extracts venus API field mapping — spec 004), `ImportJobService`
- **Endpoints** (`POST /v1/import/`): `cities`, `products`, `products/by-ids`, `categories`
- Entry: [catalog-import.module.ts](../../src/modules/catalog-import/catalog-import.module.ts)

### `suggestions/`
Preset prompt suggestions ("suggestion presets") shown on screen; loaded/gated by target/br/period. Fires suggestion events.
- Entry: [suggestions.module.ts](../../src/modules/suggestions/suggestions.module.ts)

### `admin-config/`
Admin-tunable rules: banned phrases, priority products, other config the pipeline reads.
- Entry: [admin-config.module.ts](../../src/modules/admin-config/admin-config.module.ts)

### `admin/`
AdminJS admin panel (spec `002-adminjs-admin-panel`) — CRUD over entities, category section, import triggers.
- Entry: [admin.module.ts](../../src/modules/admin/admin.module.ts)

### `analytics/`
Fire-and-forget event logging.
- Entry: [analytics.module.ts](../../src/modules/analytics/analytics.module.ts)

## Cross-cutting

### `common/llm/`
Low-level LLM transport. `LlmClient` interface + `AitunnelOpenAIClientService` (OpenAI SDK → AITunnel base URL). Prompt builders ([llm-prompts.ts](../../src/common/llm/llm-prompts.ts)) and response parsers ([llm-response.parser.ts](../../src/common/llm/llm-response.parser.ts)) used by `OpenAILLMProvider`. Registered globally in [llm.module.ts](../../src/common/llm/llm.module.ts).
Also: `filters/http-exception.filter.ts`, `interceptors/logging.interceptor.ts`, `dto/error.dto.ts`.

### `database/`
Drizzle setup. Inject `@Inject(DATABASE_TOKEN) db: DrizzleDB`. Schema split across `src/database/schema/*.ts`, re-exported from `index.ts`. Migrations in `src/database/migrations` (generated — never hand-write). Key tables: `products`, `city_products`, `product_chunks`, `product_embeddings` (vector 1536), `assistant_suggestions`, `ai_logs`, `admin_rules`, `categories` (unique on `rn,target,slug`), `cities`, `retail_networks`, `import_jobs`.

### `config/`
Zod-validated env ([configuration.ts](../../src/config/configuration.ts)). All env access goes through it; boot throws on invalid config (e.g. `OPENAI_API_KEY` required when a provider is `openai`). Read via `ConfigService.get(...)`.
Admin env vars: `ADMIN_USER`, `ADMIN_PASSWORD`, `ADMIN_COOKIE_SECRET` (min 32 chars), `INTERNAL_API_KEY`. Venus API: `CATALOG_API_BASE_URL` (product/category endpoint) and `CITIES_API_BASE_URL` (cities endpoint) are now separate.
