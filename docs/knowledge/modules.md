# Module Map

Feature modules live under `src/modules/`; cross-cutting code under `src/common/`, `src/database/`, `src/config/`. `AppModule` wires everything.

## Feature modules (`src/modules/`)

### `assistant/`

Owns the product-answer request pipeline (see [architecture.md](architecture.md)). Controller → `AssistantOrchestratorService` → intent parse → shortlist → LLM rerank → validate → hydrate → log. Holds the domain `LLMProvider` (mock/openai swap by `LLM_PROVIDER`; `parseIntent` / `rerankAndAnswer` / `answerFromKnowledge`), fallback responses, response validation. `InfoAnswerService` ([info-answer.service.ts](../../src/modules/assistant/services/info-answer.service.ts)) answers `info_question` intents from the site knowledge base (search from `site-knowledge/`, grounded LLM answer, `open_url` action to the source page).

- Entry: [assistant.module.ts](../../src/modules/assistant/assistant.module.ts), [assistant-orchestrator.service.ts](../../src/modules/assistant/services/assistant-orchestrator.service.ts)

### `rag/`

Retrieval. searchable-text builder, embeddings (mock/openai by `EMBEDDING_PROVIDER`), vector search (pgvector), keyword search, and the hybrid retriever that merges + scores them. Plus `RagBulkIndexerService` — bulk indexing of the whole catalog (see ADR-009..011).

- Entry: [rag.module.ts](../../src/modules/rag/rag.module.ts), [hybrid-retriever.service.ts](../../src/modules/rag/services/hybrid-retriever.service.ts)
- **Indexing**: `pnpm rag:index <productId>` — one product; `pnpm rag:index-all [--rn --br --target --force --dry-run --limit]` — the whole catalog ([bulk-indexer.service.ts](../../src/modules/rag/services/bulk-indexer.service.ts), CLI in [scripts/rag-index-all.ts](../../scripts/rag-index-all.ts)). Without a bulk run the vector index is empty and hybrid search silently degrades to keyword + the "all city products" fallback.

### `site-knowledge/`

Knowledge collected from the informational pages of the city sites (delivery/payment terms, bonus programme, promotions, restaurants with addresses and hours, LLM info, legal documents) — spec `011-site-info-knowledge`. The sites are client-rendered Next.js, so pages are rendered in a headless Chromium (`crawler/headless-browser.fetcher.ts`, puppeteer-core + system Edge/Chrome) and converted to markdown-like text (`crawler/html-text-extractor.ts`, cheerio). The result is a JSON snapshot in `data/site-pages/<city>.json`, kept in the repo and loaded by the importer.

- **Services**: `SiteCrawlerService` (traversal, promotion detail links), `SitePageImportService` (upsert + skip rule hash/model/status, ADR-015), `SitePageIndexerService` (embeddings in batches of 32), `SiteKnowledgeSearchService` (pgvector + tsvector, 0.7/0.3 merge, top-6; exported to `assistant`), pure `chunkPage()` (sections by headings, ≤1200 chars).
- **CLI**: `pnpm site:crawl --url <site> --rn --br --out <json>` (needs a browser), `pnpm site:import <json> [--force --dry-run]` (no browser; on prod runs in the one-off node container like `rag:index-all`). Scripts in [scripts/site-crawl.ts](../../scripts/site-crawl.ts), [scripts/site-import.ts](../../scripts/site-import.ts); logic + tests in the module.
- **Tables**: `site_pages` (unique `rn, br, url`), `site_page_chunks`, `site_page_embeddings` (vector 1536). Shared `vector` type in [schema/vector.ts](../../src/database/schema/vector.ts).
- Entry: [site-knowledge.module.ts](../../src/modules/site-knowledge/site-knowledge.module.ts)

### `catalog/`

Product lookup / filtering by `rn` / `br` / `target` (and category, ingredients, etc.). Hydrates authoritative product + city-product data.

- Entry: [catalog.module.ts](../../src/modules/catalog/catalog.module.ts), `services/catalog.service.ts`

### `catalog-import/`

Imports cities, products, and categories from external venus APIs. `CATALOG_API_MODE` = `mock` | `real` (mock vs http client behind `catalog-api.client.interface.ts`). `ImportJobService` tracks jobs.

- **Services**: `CityImportService`, `ProductImportService`, `CategoryImportService`, `ProductNormalizerService` (extracts venus API field mapping — spec 004), `ImportJobService`
- **Endpoints** (`POST /v1/internal/import/`, служебный ключ `x-internal-api-key` обязателен): `cities`, `products`, `products/by-ids`, `categories`, `attributes`
- Entry: [catalog-import.module.ts](../../src/modules/catalog-import/catalog-import.module.ts)

### `suggestions/`

Preset prompt suggestions ("suggestion presets") shown on screen. `GET /v1/assistant/suggestions` returns a **set of 6**, not the catalogue of 49: hard filters (enabled, target, screen context, active window, `allowed_br`, eligibility) → weights → deterministic weighted draw seeded from `session_id` (ADR-013). Product suggestions need matching city products, service suggestions (`intent: info_question`) need an indexed city knowledge base (ADR-014). Day part lifts matching scenarios (ADR-015). Fires suggestion events.

- Entry: [suggestions.module.ts](../../src/modules/suggestions/suggestions.module.ts)
- [suggestion.service.ts](../../src/modules/suggestions/services/suggestion.service.ts) — orchestrates filters → eligibility → stats → selection
- [suggestion-selector.service.ts](../../src/modules/suggestions/services/suggestion-selector.service.ts) — weights, type quota, context floor, weighted draw (pure, no DB)
- [suggestion-eligibility.service.ts](../../src/modules/suggestions/services/suggestion-eligibility.service.ts) — batched product checks (cache 60 s) + knowledge availability via `KNOWLEDGE_AVAILABILITY_PORT` (cache 5 min)
- [suggestion-stats.service.ts](../../src/modules/suggestions/services/suggestion-stats.service.ts) — shown/clicked aggregate per `rn|target` over 30 days (cache 60 s); empty ⇒ order by `sort_order`
- [day-part.service.ts](../../src/modules/suggestions/services/day-part.service.ts) — current day part in `SUGGESTIONS_TIMEZONE`, scenario → day part
- [suggestion-context.ts](../../src/modules/suggestions/services/suggestion-context.ts) — screen contexts (`catalog`, `cart`, `checkout`, `empty`), suggestion kind, cart add-ons

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
