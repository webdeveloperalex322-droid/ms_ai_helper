# Quickstart: Validate Product Attributes Feature

## Prerequisites

- Docker running (`docker-compose up -d`)
- `.env` configured with `CATALOG_API_MODE=mock` or `CATALOG_API_MODE=real`
- DB migrated (`pnpm db:migrate`)

## Step 1: Apply Migration

```bash
pnpm db:generate
pnpm db:migrate
```

**Expected**: Migration runs without error. `product_attributes` table exists. `products` table has `attributes` column.

```sql
-- Verify:
SELECT column_name FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'attributes';
SELECT table_name FROM information_schema.tables WHERE table_name = 'product_attributes';
```

## Step 2: Import Attribute Catalog

```bash
curl -X POST http://localhost:3000/v1/import/attributes \
  -H "Content-Type: application/json" \
  -d '{"rn": "A79C5050-1EE7-11EB-9B6E-05B5FC40DF2A"}'
```

**Expected**: `{ "job_id": "...", "status": "completed", "stats": { "imported": N } }` where N > 0.

```sql
-- Verify:
SELECT id, name, group_name FROM product_attributes LIMIT 5;
```

## Step 3: Import Products (with attributes)

```bash
curl -X POST http://localhost:3000/v1/import/products \
  -H "Content-Type: application/json" \
  -d '{"rn": "A79C5050-1EE7-11EB-9B6E-05B5FC40DF2A", "mode": "full"}'
```

**Expected**: Products upserted with `attributes` column populated.

```sql
-- Verify at least some products have attributes:
SELECT name, attributes FROM products WHERE attributes != '[]'::jsonb LIMIT 5;
```

## Step 4: Verify RAG Searchable Text

Trigger re-indexing by checking that product chunks include attribute text:

```sql
SELECT searchable_text FROM product_chunks 
WHERE searchable_text LIKE '%Атрибуты%' 
LIMIT 3;
```

**Expected**: Rows appear with text like `"Атрибуты: 42 шт."`.

## Step 5: Test AI Query (with mock or real LLM)

```bash
curl -X POST http://localhost:3000/v1/assistant/product-answer \
  -H "Content-Type: application/json" \
  -d '{
    "rn": "A79C5050-1EE7-11EB-9B6E-05B5FC40DF2A",
    "br": "<br-uuid>",
    "target": "WEB",
    "user_message": "хочу 42 штуки"
  }'
```

**Expected**: Response includes product(s) tagged with the "42 шт." attribute.

## Step 6: Run Tests

```bash
pnpm test
```

**Expected**: All existing tests pass. New tests for `AttributeImportService` and normalizer attribute extraction pass.

## Mock Mode Note

In `CATALOG_API_MODE=mock`, the mock client returns 2–3 hardcoded attributes. Product mock data must include `attributes` array items referencing those mock attribute IDs for end-to-end validation.
