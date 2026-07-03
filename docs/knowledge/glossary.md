# Glossary

Domain terms used across services. See [decisions.md](decisions.md) ADR-003 for the keying rationale.

| Term | Meaning |
|------|---------|
| **rn** | Retail network id (uuid). Top-level tenant. `DEFAULT_RN` in config. |
| **br** | Branch / city id (uuid). Availability, price, validity are per-`br`. |
| **target** | Client surface: `WEB` \| `APP` \| ... . Products/suggestions gated per target. |
| **(rn, br, target)** | The triple threaded through catalog/retrieval/validation calls. Identifies a product's concrete availability + price via a `city_products` row. |
| **shortlist** | Top ~30 candidate products from hybrid retrieval, fed to the LLM for reranking. Built by `ShortlistBuilderService` → `HybridRetrieverService`. |
| **rerank** | LLM step (`LLMProvider.rerankAndAnswer`) that picks/orders cards from the shortlist and writes `reply_text`. Bounded by `LLM_TIMEOUT_MS`, `MAX_CARDS_IN_RESPONSE`. |
| **suggestion preset** | Pre-authored prompt (`assistant_suggestions` row) triggered by `suggestion_id`. Carries a `payload` (intent + `retrieval_query`) and gating (`target`, `allowed_br`, active period, `enabled`). |
| **slot** | Structured constraint parsed from intent (category, preferred ingredients, spicy, etc.). Drives the slot-match scoring bonus in retrieval. |
| **intent** | Classified user goal. `unsupported` → fallback. Resolved from a suggestion payload or by `IntentSlotParserService`. |
| **chunk** | `product_chunks` row — searchable text + metadata per product, unit of embedding. `embedding_status` = pending/ready/failed. |
| **embedding** | `vector(1536)` in `product_embeddings`, cosine-searched (`<=>`). Model per `EMBEDDING_MODEL`. Mock provider = deterministic hash (no semantics). |
| **fallback** | A `FallbackService` response returned instead of erroring. Variants: unsupported-intent, empty-result, suggestion-empty, LLM-timeout, invalid-response. See [decisions.md](decisions.md) ADR-005. |
| **hydrate** | Re-query `city_products ⋈ products` for authoritative name/price/currency/image before returning cards. |
| **AITunnel** | OpenAI-compatible proxy at `OPENAI_BASE_URL`; `OPENAI_API_KEY` is its key. |
| **venus API** | External catalog backend. Two base URLs: `CATALOG_API_BASE_URL` (products, categories) and `CITIES_API_BASE_URL` (cities). Wrapped behind `CatalogApiClient` interface (mock \| http). |
| **category** | `categories` table row. Global per `(rn, target)`, uniquely keyed by `slug`. Cities share the same catalog; `CategoryImportService` deduplicates by slug. Soft-retired (`isActive=false`) when absent from the latest fetch. |
| **normalizer** | `ProductNormalizerService` — maps raw venus API response to `NewProduct` + `NewCityProduct`. Handles nested localization/classifiers/nutritional fields. See ADR-009. |
