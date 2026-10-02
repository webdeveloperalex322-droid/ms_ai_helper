# Architecture — Request Pipeline

NestJS modular monolith. `AppModule` wires global `ConfigModule`, `DatabaseModule`, `LlmModule`, plus feature modules under `src/modules/`. Every product answer flows through **one orchestrator**.

## Entry point

`POST /v1/assistant/product-answer` → `AssistantController` → `AssistantOrchestratorService.handle()`
[assistant-orchestrator.service.ts](../../src/modules/assistant/services/assistant-orchestrator.service.ts)

Request body fields: `rn`, `br`, `target`, `user_message`, `suggestion_id` (+ optional `session_id`, `screen_context`, `channel`).
DTO: [product-answer.request.dto.ts](../../src/modules/assistant/dto/product-answer.request.dto.ts) — **trust the DTO, not the README** (README shows a stale `city_id`).

## The 7 steps (`handle()`)

1. **Intent** — resolve from `suggestion_id` (preset loaded from DB via `loadSuggestion()`, gated on `enabled` + `target` + `allowed_br` + active period) **OR** parse `user_message` via `IntentSlotParserService`. No message and no suggestion → `forUnsupportedIntent()` fallback. `intent === 'unsupported'` → same fallback.
   - orchestrator `assistant-orchestrator.service.ts:66-118`
   - parser [intent-slot-parser.service.ts](../../src/modules/assistant/services/intent-slot-parser.service.ts)

   - `intent === 'info_question'` (delivery, payment, bonuses, promotions, restaurants, company, legal) → **service branch**, no shortlist: `InfoAnswerService.answer()` ([info-answer.service.ts](../../src/modules/assistant/services/info-answer.service.ts)) runs `SiteKnowledgeSearchService` (pgvector + tsvector over `site_page_chunks` of the city, top-6) → `LLMProvider.answerFromKnowledge()` raced against `LLM_TIMEOUT_MS` → reply with `cards: []` and `actions: [{ type: 'open_url', url, title }]` for the source page. `empty` (no knowledge for the city) → `forUnsupportedIntent()` / preset fallback; `timeout` → `forInfoTimeout(best)` (excerpt of the best passage); `not_found` → model text or `forInfoNotFound()`. Logged as `validation_status = info_answer | info_not_found | info_empty | info_timeout`, sources in `ai_logs.llm_response`. Knowledge is loaded by `pnpm site:crawl` + `pnpm site:import` (see [modules.md](modules.md) → `site-knowledge/`).

2. **Shortlist** — `ShortlistBuilderService.build()` → `HybridRetrieverService.retrieve()`:
   embed query → **parallel** vector search (pgvector `<=>` cosine) + keyword search (each `.catch(() => [])`) → merge/dedupe by `product_id` → hydrate from catalog → score → sort → top ~30.
   Empty candidate map → fallback to all city products (`catalogService.findByCity`, score 0.5).
   Empty shortlist → `forSuggestionEmpty()` / `forEmptyResult()` fallback.
   - [hybrid-retriever.service.ts](../../src/modules/rag/services/hybrid-retriever.service.ts), [vector-search.service.ts](../../src/modules/rag/services/vector-search.service.ts), [keyword-search.service.ts](../../src/modules/rag/services/keyword-search.service.ts)
   - **Scoring** ([hybrid-retriever.service.ts:111-144](../../src/modules/rag/services/hybrid-retriever.service.ts#L111)):
     `score = semanticScore*0.35 + keywordScore*0.2 + slotMatch*0.25 + 0.1` (availability), capped at 1.
     `slotMatch`: category match +20; each preferred-ingredient match +15 (cap 40); non-spicy when `spicy=false` +10.

3. **LLM rerank** — `LLMProvider.rerankAndAnswer()` wrapped in `Promise.race` against `LLM_TIMEOUT_MS` (default 6000). `max_cards` = `MAX_CARDS_IN_RESPONSE` (default 5). Timeout/error → `forLLMTimeout(shortlist)` fallback.
   - `assistant-orchestrator.service.ts:148-179`

4. **Validate** — `ResponseValidatorService.validate()` sanitizes LLM output: enforces shortlist membership, max cards, banned phrases. All-invalid (`sanitized.selected.length === 0`) → `forInvalidResponse()` fallback.
   - [response-validator.service.ts](../../src/modules/assistant/services/response-validator.service.ts)

5. **Hydrate cards** — `buildCards()` re-queries `city_products ⋈ products` by `id`/`rn`/`br`/`target` for authoritative name/price/currency/image. Rows not found are dropped.
   - `assistant-orchestrator.service.ts:281-328`

6. **Log** — `logRequest()` writes an `ai_logs` row on **every** path (best-effort, wrapped in try/catch, never throws to caller).
   - `assistant-orchestrator.service.ts:342-373`

7. **Respond** — success returns `reply_text` + `cards` + `actions` + `quick_replies`; every failure branch returns a `FallbackService` response, **not an HTTP error**. The endpoint is designed to always answer.
   - [fallback.service.ts](../../src/modules/assistant/services/fallback.service.ts) — `forUnsupportedIntent` / `forEmptyResult` / `forSuggestionEmpty` / `forLLMTimeout` / `forInvalidResponse`

## Two LLM abstractions (do not conflate)

- **`LlmClient`** — low-level transport. Only impl `AitunnelOpenAIClientService` (OpenAI SDK pointed at AITunnel). chatCompletion / stream / embeddings / balance. Registered globally in `LlmModule`.
  [llm-client.interface.ts](../../src/common/llm/llm-client.interface.ts)
- **`LLMProvider`** — high-level domain ops `parseIntent` / `rerankAndAnswer`. Impls `MockLLMProvider` + `OpenAILLMProvider`. Bound at runtime in `AssistantModule` by `LLM_PROVIDER` env.
  [llm.provider.interface.ts](../../src/modules/assistant/providers/llm.provider.interface.ts)

Embeddings mirror this: `EmbeddingProvider` swaps mock/openai via `EMBEDDING_PROVIDER`.
[embedding.provider.interface.ts](../../src/modules/rag/providers/embedding.provider.interface.ts)

See [decisions.md](decisions.md) for _why_ it's split this way.
