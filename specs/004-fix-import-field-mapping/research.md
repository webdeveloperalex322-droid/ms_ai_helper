# Research: Fix Product Import Field Mapping

## R1. Where should nested→flat mapping live?

**Decision**: In `ProductNormalizerService` (normalizer reads nested paths). The `ProductApiResponse` interface becomes the real nested API shape.

**Rationale**:
- `rawPayload` (products + city_products) must store the **full original nested** object for audit and future field extraction (classifiers, crossSale, attributes, etc.). If the http client flattened the response first, that richness would be lost before it reached the normalizer.
- The normalizer is already the single transform point from API object → DB rows; keeping the mapping there means one place owns "API shape knowledge."
- Matches spec FR-009 (interface + mock reflect real nested shape).

**Alternatives considered**:
- *Flatten in http client (adapter DTO)*: cleaner external/internal separation, but strips `rawPayload` richness and duplicates transform logic (mock would still need to match a flat DTO that no longer mirrors reality). Rejected.
- *Second "raw" side-channel field alongside flat DTO*: messy, two shapes to maintain. Rejected.

## R2. Nested field path map (from real API sample)

| DB field | Real API path | Transform |
|---|---|---|
| calories | `additionalProperties.nutritional.calorie` | number → string |
| protein | `additionalProperties.nutritional.proteins` | number → string |
| fat | `additionalProperties.nutritional.fat` | number → string |
| carbs | `additionalProperties.nutritional.carbohydrates` | number → string |
| weight | `additionalProperties.nutritional.weight` | number → string |
| pieces | `additionalProperties.pieces` | number (int) |
| description | `productDescription` → fallback `localization[ru?0].productDescription` | trim, null if empty |
| ingredients | `additionalProperties.nutritional.composition.value` | split `,` → trim → drop empties → array; null if empty |
| categoryName | `classifiers[]` where `categoryId == mainCategotyId`, else `classifiers[0]`; read localized (ru?0) name / `name` | null only if classifiers empty |
| name | `localization[ru?0].name` → fallback top-level `name` | trim |
| categoryId | `categoryId` (top-level) | unchanged (already works) |
| price / oldPrice | `price` / `oldPrice` | unchanged |
| imageUrl | `imageUrl` | unchanged |
| externalProductId | `productId` → fallback `id` | unchanged |

**Locale rule** (clarified): pick `localization[]` / `classifiers[].localization[]` entry with `language == "ru"`, else index `[0]`.

**Note on key names**: source uses `calorie` (singular), `proteins` (plural), `carbohydrates` — easy to mis-map. Test must assert exact values.

## R3. Ingredients extraction

**Decision**: `composition.value` is a single comma-separated Russian string. Split on `,`, trim each, drop empties → `string[]`. Empty/absent source → `null` (not `[""]`).

**Rationale**: No structured ingredient array exists in the API. Matches FR-004 and the existing `ingredients` jsonb string[] column.

**Alternatives**: Store raw string in a text column — rejected, column is jsonb array and downstream RAG expects tokens.

## R4. UTF-8 mojibake investigation (FR-011)

**Findings**:
- The provided `.txt` sample shows classic mojibake: `Ð Ð¾Ð»Ð»` = the UTF-8 bytes of `Ролл` reinterpreted through a single-byte codepage (latin1/cp1251). This is a **decode-with-wrong-charset** artifact, not corrupted source data.
- Import path: `CatalogApiHttpClient` → `@nestjs/axios` `HttpService.get(url)` → returns `response.data`. axios default `responseType: 'json'` / `responseEncoding: 'utf8'` decodes the body as UTF-8 and `JSON.parse`s it. For a UTF-8 JSON body this is correct and produces clean Cyrillic.
- The garbled text in the shared `.txt` is most plausibly a **save/display artifact of that file**, not proof the code path double-decodes. It cannot be confirmed against the live API locally (no real-API creds; `CATALOG_API_MODE=mock`).

**Decision** (defensive, low-risk fix within this change):
1. Set `responseType: 'json'` and `responseEncoding: 'utf8'` **explicitly** on the catalog product/category GET/POST calls in `CatalogApiHttpClient`, so behavior does not depend on server `Content-Type` charset headers being present/correct.
2. Add an http-client test asserting a UTF-8 JSON body containing Cyrillic round-trips to correct characters (no mojibake).
3. **Do NOT** add a blind cp1251→utf8 "repair" transform. Blindly re-decoding already-correct UTF-8 would corrupt it; such a repair is only justified if the live API is proven to double-encode. Documented as a follow-up trigger.

**Escalation trigger**: If a real-API import still yields garbled Cyrillic after step 1, capture the raw bytes + `Content-Type` header and add a targeted decode fix (separate change) — do not guess.

**Rationale**: Satisfies "investigate + fix here" with a safe, correct hardening (explicit utf8) plus a regression test, while avoiding a dangerous speculative transform.

## R5. Backward compatibility of interface change

**Decision**: Redefine `ProductApiResponse` to the nested shape; keep the `[key: string]: any` index signature. Remove the old flat top-level fields that don't exist in the real API (`calories`, `protein`, `fat`, `carbs`, `weight`, `pieces`, `ingredients`, `allergens`, `tags`, `description`, `categoryName`) OR mark clearly deprecated — chosen: **remove**, since keeping them invites the same silent-null bug.

**Impact**: `catalog-api-mock.client.ts` (MOCK_PRODUCTS) and `mock-client.spec.ts` / `product-normalizer.spec.ts` reference the flat fields and must be rewritten to the nested shape. `product-import.service.ts` consumes `NormalizedProduct` (output), not `ProductApiResponse` (input) → unaffected.

**Allergens/tags**: no source field in the sample → stay null (unmapped). Documented in spec Assumptions.
