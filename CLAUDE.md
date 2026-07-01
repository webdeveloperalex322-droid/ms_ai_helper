# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

AI Product Assistant backend (MVP) for a sushi delivery service. Answers user product questions in Russian and returns ranked product cards. NestJS 10 + Fastify, PostgreSQL 15 + pgvector, Drizzle ORM, Vitest. Package manager is **pnpm** (Node >= 22).

## Commands

```bash
pnpm install                          # install deps
docker-compose up -d                  # start Postgres (pgvector/pgvector:pg16) on :5432
pnpm db:migrate                       # apply Drizzle migrations (src/database/migrations)
pnpm db:seed                          # seed data (seeds/index.ts)
pnpm start:dev                        # watch-mode dev server -> http://localhost:3000/v1
                                      # Swagger: http://localhost:3000/v1/docs

pnpm build                            # nest build -> dist/
pnpm start                            # run built dist/main

pnpm test                             # vitest run (unit + integration: src/**/*.spec.ts, test/**/*.test.ts)
pnpm test:watch                       # vitest watch
pnpm test:coverage                    # coverage (v8)
pnpm test:e2e                         # e2e only (test/e2e/**, separate vitest.e2e.config.ts, 30s timeout)
pnpm lint                             # eslint --fix over {src,test,seeds}
pnpm format                           # prettier --write

pnpm db:generate                      # drizzle-kit generate (after editing schema)
pnpm db:studio                        # drizzle-kit studio
```

Run a single test: `pnpm vitest run src/modules/rag/tests/searchable-text-builder.spec.ts` or filter by name `pnpm vitest run -t "partial name"`.

Note: `NODE_ENV=test` makes config and migrations load `.env.test` instead of `.env`.

## Architecture

NestJS modular monolith. `AppModule` wires global `ConfigModule`, `DatabaseModule`, `LlmModule`, plus feature modules under `src/modules/`.

### Request pipeline (the core flow)

`POST /v1/assistant/product-answer` -> `AssistantController` -> `AssistantOrchestratorService.handle()` ([assistant-orchestrator.service.ts](src/modules/assistant/services/assistant-orchestrator.service.ts)). Steps:

1. **Intent** — resolve from `suggestion_id` (preset, loaded from DB with target/br/period gating) OR parse `user_message` via `IntentSlotParserService`. Unsupported intent -> fallback.
2. **Shortlist** — `ShortlistBuilderService` -> `HybridRetrieverService.retrieve()`: embeds query, runs vector search (pgvector) + keyword search **in parallel**, merges/dedupes by product_id, hydrates from catalog, scores (semantic 0.35 + keyword 0.2 + slot-match bonus), returns top ~30. Empty candidate map falls back to all city products.
3. **LLM rerank** — `LLMProvider.rerankAndAnswer()` wrapped in `Promise.race` against `LLM_TIMEOUT_MS`. Timeout/error -> `FallbackService.forLLMTimeout`.
4. **Validate** — `ResponseValidatorService` sanitizes LLM output (enforces shortlist membership, max cards, banned phrases). All-invalid -> fallback.
5. **Hydrate cards** — re-query `cityProducts ⋈ products` by rn/br/target for authoritative name/price/image.
6. **Log** — every path writes an `aiLogs` row (best-effort; never throws to caller).

Every failure branch returns a `FallbackService` response, not an HTTP error — the endpoint is designed to always answer.

### Two distinct LLM abstractions (do not conflate)

- **`LlmClient`** ([common/llm/llm-client.interface.ts](src/common/llm/llm-client.interface.ts)) — low-level transport. Only impl `AitunnelOpenAIClientService` wraps the OpenAI SDK pointed at **AITunnel** (`OPENAI_BASE_URL` default `https://api.aitunnel.ru/v1/`). Handles chatCompletion/stream/embeddings/balance and maps SDK errors to `LlmClientError`. Registered globally in `LlmModule`.
- **`LLMProvider`** ([modules/assistant/providers/llm.provider.interface.ts](src/modules/assistant/providers/llm.provider.interface.ts)) — high-level domain ops `parseIntent` / `rerankAndAnswer`. Two impls: `MockLLMProvider` (no API key) and `OpenAILLMProvider` (delegates to `LlmClient` + prompt builders in `common/llm/llm-prompts.ts` + parsers in `llm-response.parser.ts`). Bound at runtime in `AssistantModule` by `LLM_PROVIDER` env (`mock` | `openai`).

Embeddings follow the same mock/openai swap via `EMBEDDING_PROVIDER` in the RAG module.

### Other modules

- `catalog-import/` — imports cities & products from external venus APIs (`CATALOG_API_MODE` = `mock` | `real`, mock vs http client behind `catalog-api.client.interface.ts`); `ImportJobService` tracks jobs.
- `catalog/` — product lookup/filtering by rn/br/target.
- `rag/` — searchable-text builder, embeddings, vector + keyword + hybrid search.
- `suggestions/` + `admin-config/` — preset prompts and admin rules/banned phrases/priority products.
- `analytics/` — fire-and-forget event logging.

### Key domain identifiers

Products are keyed by **rn** (retail network), **br** (branch/city), **target** (`WEB` | `APP` ...). Most service signatures thread `(rn, br, target)`. `DEFAULT_RN` is in config.

## Conventions

- **Config**: all env access goes through Zod-validated `configuration.ts`. Add new vars to the schema there; validation throws on boot if invalid (e.g. `OPENAI_API_KEY` required when provider is `openai`). Read via `ConfigService.get(...)`.
- **DB**: inject `@Inject(DATABASE_TOKEN) db: DrizzleDB`. Schema split across files in `src/database/schema/`, re-exported from `index.ts`. Edit schema -> `pnpm db:generate` -> `pnpm db:migrate`. Never hand-write SQL migrations.
- **Path alias**: `@/` -> `src/` (configured in both vitest configs and tsconfig).
- DTOs use `class-validator` + `@nestjs/swagger` decorators; global `ValidationPipe` whitelists.

## Gotchas

- **README API examples are stale/inaccurate.** The real `product-answer` request body uses `rn` / `br` / `target` / `user_message` / `suggestion_id` (see [product-answer.request.dto.ts](src/modules/assistant/dto/product-answer.request.dto.ts) and the controller), not the `city_id` shown in README. Trust the DTOs/controllers over README. README also references `pnpm test:cov` — the real script is `pnpm test:coverage`.
- `.cursor/` holds **spec-kit** (speckit) skills and `specs/` holds feature specs — this repo follows a spec-driven workflow.
- All Postgres access needs the pgvector extension; use the provided docker image, not vanilla Postgres.
