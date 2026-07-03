# Decisions (ADR log)

The *why* behind non-obvious choices. Add an entry when you make a decision that a future reader (human or Claude) would otherwise have to reverse-engineer from code. Newest at top.

Format: **Decision** — Context / Why — Consequences.

---

## ADR-011: Product attributes — JSONB on products + reference table

**Decision:** Store attribute values per-product as `attributes: jsonb` on `products` table; maintain `product_attributes` as a reference/dictionary table per rn.
**Why:** Venus API `/v1/attributes/PRODUCT` returns display-label badges (name + group), not typed key-value pairs. JSONB on `products` is flexible for RAG and avoids a join table. GIN index on `products.attributes` allows containment queries. Reference table (`product_attributes`) provides discoverability and admin visibility of all available attributes per rn.
**Consequences:** `AttributeImportService` imports the dictionary via `POST /v1/import/attributes`. `ProductNormalizerService` extracts `raw.attributes[]` into `{ id, name }[]` and stores on `products.attributes`. `SearchableTextBuilderService` appends `Атрибуты: <names>` to searchable text and includes `attributes` in chunk metadata. `HybridRetrieverService.computeScore()` adds `+10` per matching attribute name from `filters.attributeNames`.
**Where:** [product-attributes.ts](../../src/database/schema/product-attributes.ts), [attribute-import.service.ts](../../src/modules/catalog-import/services/attribute-import.service.ts), [searchable-text-builder.service.ts](../../src/modules/rag/services/searchable-text-builder.service.ts)

## ADR-010: Categories are global per (rn, target); deduped by slug across cities

**Decision:** `CategoryImportService` iterates all active city slugs but writes only one `categories` row per `(rn, target, slug)`, regardless of how many cities return the same category.
**Why:** The venus API returns the same category catalog for every city slug — storing per-city would create duplicate rows with identical slugs. The unique constraint `categories_rn_target_slug_uniq` enforces this at DB level.
**Consequences:** The `br` column is set to the first city's `br` that returned the category (arbitrary). Soft-retire (`isActive=false`) when a slug disappears — never hard-delete. Skip deactivation when the entire fetch returns 0 categories (safety guard against accidental wipe).
**Where:** [category-import.service.ts](../../src/modules/catalog-import/services/category-import.service.ts), [categories.ts](../../src/database/schema/categories.ts)

## ADR-009: `ProductNormalizerService` extracted for venus API field mapping

**Decision:** All venus API → DB field mapping lives in `ProductNormalizerService.normalize()`, separate from `ProductImportService`.
**Why:** Venus API response shape is nested: localization arrays, classifiers array, `additionalProperties.nutritional`. Centralising mapping makes it unit-testable and decouples field resolution from import orchestration. Key gotcha: `raw.id` carries a target suffix (e.g. `<guid>-WEB`) that breaks the `uuid` column — use `raw.productId ?? raw.id` for `externalProductId`.
**Consequences:** `categoryName` resolved from `classifiers[]` matching `mainCategotyId` (note: API typo preserved). `name` / `description` prefer the `ru` localization entry, fall back to top-level field. All nutritional data (`weight`, `calories`, `protein`, `fat`, `carbs`) stored as `text` (not numeric).
**Where:** [product-normalizer.service.ts](../../src/modules/catalog-import/services/product-normalizer.service.ts), spec [004-fix-import-field-mapping](../../specs/004-fix-import-field-mapping/)

## ADR-001: Two separate LLM abstractions

**Decision:** Keep `LlmClient` (transport) and `LLMProvider` (domain) as distinct layers; do not merge.
**Why:** `LlmClient` ([common/llm/llm-client.interface.ts](../../src/common/llm/llm-client.interface.ts)) is a thin wrapper over the OpenAI SDK — chatCompletion/stream/embeddings/balance, maps SDK errors to `LlmClientError`. `LLMProvider` ([modules/assistant/providers/llm.provider.interface.ts](../../src/modules/assistant/providers/llm.provider.interface.ts)) speaks domain: `parseIntent` / `rerankAndAnswer`, owns prompt building + response parsing. Splitting keeps transport swappable (any OpenAI-compatible endpoint) independent of domain prompt logic, and lets tests mock at either layer.
**Consequences:** Two mock/openai switches (`LLM_PROVIDER` for domain, and the single transport impl). Don't call the SDK from domain code; go through `LlmClient`.

## ADR-002: AITunnel as the OpenAI base URL

**Decision:** `OPENAI_BASE_URL` defaults to `https://api.aitunnel.ru/v1/`; the only `LlmClient` impl is `AitunnelOpenAIClientService`.
**Why:** AITunnel is an OpenAI-compatible proxy (access/billing/region). Uses the standard OpenAI SDK, just repointed.
**Consequences:** `OPENAI_API_KEY` is the AITunnel key. Model ids come from AITunnel's catalog (`LLM_MODEL` default `gpt-4o-mini`, `EMBEDDING_MODEL` default `text-embedding-3-small`).

## ADR-003: Products keyed by (rn, br, target)

**Decision:** Thread `rn` (retail network), `br` (branch/city), `target` (`WEB`|`APP`|...) through service signatures; `DEFAULT_RN` in config.
**Why:** Same product differs by network, city, and client surface — availability, price, validity are per `city_products` row, not per `products` row. Card hydration always re-queries `city_products ⋈ products` for authoritative price/name/image.
**Consequences:** Nearly every catalog/retrieval/validation call carries the triple. Missing any → wrong or empty results. See [glossary.md](glossary.md).

## ADR-004: Hybrid retrieval — parallel vector + keyword, weighted score

**Decision:** Run pgvector cosine search and keyword search **in parallel**, merge/dedupe by `product_id`, score
`semantic*0.35 + keyword*0.2 + slotMatch*0.25 + 0.1`, cap 1. Shortlist ~30.
**Why:** Semantic catches paraphrase/intent; keyword catches exact names/rare tokens embeddings miss. Slot bonuses (category +20, ingredient +15 cap 40, non-spicy +10) inject structured intent. `+0.1` because everything is pre-filtered to available. Each search `.catch(() => [])` so one failing engine degrades gracefully.
**Where:** [hybrid-retriever.service.ts:111-144](../../src/modules/rag/services/hybrid-retriever.service.ts#L111).
**Consequences:** Weights are hand-tuned magic numbers — change deliberately. Empty candidate map → fallback to all city products (score 0.5).

## ADR-005: Always answer — never HTTP-error the pipeline

**Decision:** Every failure branch in the orchestrator returns a `FallbackService` response, not an exception to the client.
**Why:** Product UX requires the assistant to always say *something* useful (clarify, generic list, or apology), even on LLM timeout, empty retrieval, invalid LLM output, or unexpected error.
**Where:** `assistant-orchestrator.service.ts` — `forUnsupportedIntent` / `forEmptyResult` / `forSuggestionEmpty` / `forLLMTimeout` / `forInvalidResponse`. Logging is best-effort (try/catch, never throws).
**Consequences:** Don't add throwing paths to `handle()`. Diagnose failures via `ai_logs.validation_status` + `fallback_used`, not HTTP 5xx.

## ADR-006: Mock-by-default providers for local dev

**Decision:** `LLM_PROVIDER`, `EMBEDDING_PROVIDER`, `CATALOG_API_MODE` all default to `mock`.
**Why:** Boot and run the whole app with **no API key** and no external venus dependency. Config validation only requires `OPENAI_API_KEY` when a provider is set to `openai` ([configuration.ts:49-56](../../src/config/configuration.ts#L49)).
**Consequences:** Mock embeddings are a deterministic hash ([mock-embedding.provider.ts](../../src/modules/rag/providers/mock-embedding.provider.ts)) — **no real semantics**. Vector search results are meaningless under mock; switch `EMBEDDING_PROVIDER=openai` for real retrieval quality.

## ADR-007: pgvector required; Windows native needs a compiled build

**Decision:** All Postgres access needs the pgvector extension. Docker path uses `pgvector/pgvector:pg16`.
**Why / native gotcha:** On this dev machine (native PostgreSQL 18, no docker), pgvector isn't bundled — compiled v0.8.3 from source (v0.8.0 fails on PG18: `vacuum_delay_point(bool)` signature change). See `../../.claude/memory/local-run-without-docker.md`.
**Consequences:** Don't use vanilla Postgres. `product_embeddings.embedding` is `vector(1536)`; changing embedding model dimensions requires a schema/migration change.

## ADR-008: Spec-kit driven workflow

**Decision:** Features go through GitHub Spec-Kit (`/speckit-specify → clarify → plan → tasks → analyze → implement`); artifacts in `specs/<NNN-short-name>/`, principles in `.specify/memory/constitution.md`.
**Why:** Spec-first keeps design decisions reviewable before code.
**Consequences:** For any non-trivial change, create/extend a spec under `specs/` rather than coding straight away. Trivial docs/lookups may skip.
