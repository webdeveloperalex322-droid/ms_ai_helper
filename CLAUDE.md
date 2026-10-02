# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project knowledge base

Curated project knowledge lives in [docs/knowledge/](docs/knowledge/) — architecture map, module map, decisions (ADRs), glossary. **Consult it before deep code dives** to answer "where/how/why does X work". When you make a non-obvious decision, add an entry to [docs/knowledge/decisions.md](docs/knowledge/decisions.md).

## What this is

AI Product Assistant backend (MVP) for a sushi delivery service. Answers user product questions in Russian and returns ranked product cards. NestJS 10 + Fastify, PostgreSQL 15 + pgvector, Drizzle ORM, Vitest. Package manager is **pnpm** (Node >= 22).

## Commands

```bash
pnpm install                          # install deps
docker-compose up -d                  # start Postgres (pgvector/pgvector:pg16) on :5432
pnpm db:migrate                       # apply Drizzle migrations (src/database/migrations)
pnpm db:seed                          # seed data (seeds/index.ts)
pnpm rag:index-all                    # build chunks + embeddings for the WHOLE catalog
                                      # (--rn/--br/--target slice, --force, --dry-run, --limit)
                                      # required after an import: without it vector search is empty
pnpm rag:index <productId>            # same for a single product
pnpm site:crawl --url <site> --rn <rn> --br <br> --out data/site-pages/<city>.json
                                      # render the city site's info pages (delivery, bonuses,
                                      # promotions, restaurants, legal) in headless Edge/Chrome
                                      # -> JSON snapshot; needs a browser (--browser / BROWSER_EXECUTABLE_PATH)
pnpm site:import data/site-pages/<city>.json [--force] [--dry-run]
                                      # load snapshot into site_pages + chunks + embeddings;
                                      # without it service questions (delivery/payment/bonuses)
                                      # fall back to the old "products only" refusal
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

### Service questions (`info_question`)

Questions about delivery, payment, bonuses, promotions, restaurant addresses/hours, the company or legal terms are routed **before** the shortlist to `InfoAnswerService` (`modules/assistant/services/info-answer.service.ts`): hybrid search over `site_page_chunks` of the city (`modules/site-knowledge/`) → `LLMProvider.answerFromKnowledge()` grounded on the passages → reply with an `open_url` action to the source page, `cards: []`. Empty knowledge base → the old unsupported-intent fallback; LLM timeout → excerpt of the best passage. Knowledge comes from `pnpm site:crawl` + `pnpm site:import` (snapshot in `data/site-pages/`), see spec `011-site-info-knowledge`.

### Other modules

- `site-knowledge/` — crawler (puppeteer-core + cheerio), snapshot import, chunking, indexing and hybrid search over site page knowledge. Tables `site_pages`, `site_page_chunks`, `site_page_embeddings`.
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
