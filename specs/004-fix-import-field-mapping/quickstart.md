# Quickstart: Validate Product Import Field Mapping Fix

Prove that КЖБУ, description, ingredients, pieces, weight, and categoryName now persist from a real API payload.

## Prerequisites

- `pnpm install`
- No DB needed for the unit-level validation (normalizer test is pure). DB only needed for the end-to-end import check.

## 1. Unit validation (primary — no DB)

Run the normalizer regression test built from the real-payload fixture:

```bash
pnpm vitest run src/modules/catalog-import/tests/product-normalizer.spec.ts
```

**Expected**: PASS. Asserts every field in [contracts/normalizer-mapping.contract.md](contracts/normalizer-mapping.contract.md) — nutrition (260/5.9/10.4/35.8), weight "250", pieces, ingredients array of 9 items, `categoryName` "Роллы и суши", non-empty description, `rawPayload` deep-equals input.

**Regression guard**: revert any single nested path in `product-normalizer.service.ts` → this test MUST fail (SC-003).

## 2. Encoding validation (mojibake)

```bash
pnpm vitest run src/modules/catalog-import/tests/http-client.spec.ts
```

**Expected**: PASS, including the new case asserting a UTF-8 JSON body with Cyrillic (`Ролл`) round-trips without mojibake (no `Ð` artifacts).

## 3. End-to-end import check (optional — needs DB)

```bash
docker-compose up -d
pnpm db:migrate
CATALOG_API_MODE=mock pnpm start:dev   # mock now emits nested shape
```

Trigger an import (admin catalog-import endpoint / job), then inspect a persisted product:

```sql
SELECT name, category_name, calories, protein, fat, carbs, weight, pieces,
       jsonb_array_length(ingredients) AS ingredient_count, length(description) AS desc_len
FROM products
LIMIT 5;
```

**Expected**: `calories/protein/fat/carbs/weight/pieces` non-null, `category_name` populated, `ingredient_count > 0`, `desc_len > 0`. Before the fix these were all null/0.

## 4. Full suite

```bash
pnpm test
```

**Expected**: PASS. `mock-client.spec.ts` and `product-normalizer.spec.ts` updated for the nested shape; no other suite affected (`NormalizedProduct` output + DB schema unchanged).
