# Research: Status Management for Cities and Products

**Feature**: 006-status-management
**Date**: 2026-07-04

---

## Current State Audit

### Schema

| Table | Field | Type | Exists? | Notes |
|-------|-------|------|---------|-------|
| `cities` | `isActive` | `boolean NOT NULL DEFAULT true` | Yes | Import sets it; admin cannot edit |
| `products` | `isActive` | — | **NO** | Must be added via migration |
| `city_products` | `isAvailable` | `boolean NOT NULL DEFAULT true` | Yes | Different concern; set by import |
| `city_products` | `isValid` | `boolean NOT NULL DEFAULT true` | Yes | Different concern; set by import |

### AdminJS Resources

| Resource | `isActive` editable? | Filter on `isActive`? | Actions allowed? |
|----------|---------------------|-----------------------|-----------------|
| `cities.resource.ts` | No — fully read-only | Yes (filter only) | None (no new/edit/delete) |
| `products.resource.ts` | N/A — field missing | N/A | Edit only (no new/delete) |
| `city-products.resource.ts` | N/A | Yes (`isAvailable`, `isValid`) | Edit only |

### API Query Filtering (current gaps)

| Service | Filters by `cities.isActive`? | Filters by `products.isActive`? |
|---------|-------------------------------|----------------------------------|
| `VectorSearchService` | No | No |
| `KeywordSearchService` | No | No |
| `CatalogService.findByCity()` | No | No |

All three filter `cityProducts.isAvailable = true` and `cityProducts.isValid = true` but not city or product active status.

### Import Skip Logic

`getActiveBrs(rn)` in `product-import.service.ts:295-301`:
- Queries `cities WHERE rn = ? AND isActive = true`
- Used by both `importFull()` (line 89) and `importByIds()` (line 182)
- Category import similarly gates on `isActive = true`
- **Status: already correct — no changes needed to import layer**

### Fallback Waterfall (current)

```
HybridRetriever.retrieve() → empty candidates
  → CatalogService.findByCity() (all city products, no LLM)
    → empty again
      → FallbackService.forEmptyShortlist()
```

FR-010 requires empty array (HTTP 200) when emptiness is caused by status filters — NOT FallbackService.

---

## Design Decisions

### Decision 1: products.isActive migration
- **Decision**: Add `products.isActive boolean NOT NULL DEFAULT true` via Drizzle migration
- **Rationale**: `DEFAULT true` preserves all existing products as active after migration
- **Alternatives**: per-city toggle via `city_products` — rejected (spec explicitly says global flag; per-city already handled by `isAvailable`)

### Decision 2: API filter placement
- **Decision**: Add `cities.isActive = true` and `products.isActive = true` filters directly in SQL queries in `VectorSearchService`, `KeywordSearchService`, and `CatalogService.findByCity()`
- **Rationale**: Single enforcement point at query layer; no risk of bypass through any code path
- **Alternatives**:
  - Filter in orchestrator after hydration — rejected (wastes compute fetching data to discard)
  - Filter only in orchestrator pre-flight — rejected (does not cover keyword/vector paths independently)

### Decision 3: Empty response for status-filtered results (FR-010)
- **Decision**: Add pre-flight gate in `AssistantOrchestratorService` before shortlist build:
  1. Check `cities.isActive` for the requested `br` → if false, return `{ cards: [], answer: '' }` immediately
  2. Check count of active products for `(rn, br, target)` → if 0, return `{ cards: [], answer: '' }` immediately
- **Rationale**: Two cheap DB reads prevent triggering FallbackService when emptiness is caused by operator-controlled status. City check handles the most common case (disabled city); product count check handles the edge case where all products are individually disabled.
- **Alternatives**:
  - Detect post-hoc (inspect empty result, infer cause) — rejected (fragile, hard to test)
  - Return FallbackService response — rejected (violates FR-010 and user decision)

### Decision 4: Admin cities resource — enable edit for isActive only
- **Decision**: In `cities.resource.ts`, add edit action but restrict editable fields to `isActive` only. All other city fields remain read-only (imported from venus API).
- **Rationale**: Minimal surface — operators should not be able to corrupt imported city data; status toggle is the only operator concern.

### Decision 5: Admin products resource — add isActive toggle
- **Decision**: In `products.resource.ts`, add `isActive` to the editable fields list alongside existing editable text fields.
- **Rationale**: Consistent with existing edit pattern; no new action types needed.

---

## Impact Map

| Layer | Changes needed |
|-------|---------------|
| DB schema | Add `products.isActive` column + migration |
| SQL queries | Add `cities.isActive` + `products.isActive` filters (3 services) |
| Orchestrator | Pre-flight city/product active check before shortlist build |
| AdminJS | `cities.resource.ts` — enable edit, make `isActive` editable |
| AdminJS | `products.resource.ts` — add `isActive` to editable fields |
| Tests | Update SQL query tests + add orchestrator pre-flight tests |
