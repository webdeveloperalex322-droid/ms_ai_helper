# Research: Product Attributes System

## Decision 1: Attribute API Shape

**Decision**: The `/v1/attributes/PRODUCT` endpoint returns **label-based badge objects**, not typed key-value pairs.

Real API response shape:
```json
[
  {
    "id": "586A8BB0-42EE-11EC-A906-67B9D171036F",
    "type": "PRODUCT",
    "attribute": {
      "id": "586A8BB0-42EE-11EC-A906-67B9D171036F",
      "name": "42 шт.",
      "slug": "",
      "value": "",
      "backgroundColor": "#00CED1",
      "textColor": "#FFFFFF",
      "group": { "name": "Representation", "orderIndex": 1, "localization": [] },
      "localization": []
    },
    "_parent": "<rn-uuid>",
    "_createTime": "...",
    "_updateTime": "..."
  }
]
```

**Implications**:
- No `code` field → use `externalId` (UUID) as the stable identifier, `name` as the label
- No `valueType` → attributes are labels, not typed scalars
- The `attribute.name` IS the human-readable value (e.g. "42 шт.", "Пицца 35 см")
- `attribute.group.name` provides grouping (e.g. "Representation")
- `attribute.value` is always empty string → ignored

**Alternatives considered**: Using `slug` as identifier — rejected because it is always empty string in the real API.

---

## Decision 2: Product `attributes` Field Shape

**Decision**: The product API response's `attributes` array (currently untyped via `[key: string]: any`) is expected to be an array of objects with at minimum an `id` field referencing the attribute catalog. For robustness, normalize to `{ id: string; name: string }[]` — name resolved from the catalog at import time if absent in the product response.

**Rationale**: Since the catalog is imported first, names can always be resolved. Storing name inline in product attributes avoids joins at query time.

**Alternatives considered**: Storing only `id[]` — rejected because the searchable text builder needs names without extra DB lookups.

---

## Decision 3: Reference Table Schema

**Decision**: `product_attributes` table columns:
- `id` (UUID PK, generated)
- `rn` (UUID, retail network)
- `externalId` (text, the API's attribute UUID as string)
- `name` (text, attribute label)
- `groupName` (text, nullable, from `attribute.group.name`)
- `isActive` (boolean, default true)
- `rawPayload` (jsonb, full API object)
- `updatedAt` (timestamp)
- Unique constraint: `(rn, externalId)`

**No `code` or `valueType` fields** — the real API has neither.

---

## Decision 4: Drizzle GIN Index Syntax

**Decision**: Use `index('name').using('gin').on(table.column)` in the table's third argument.

The `products` table already has a third-argument callback (for `rnExtIdUniq`). Add GIN index to the same object:
```typescript
(table) => ({
  rnExtIdUniq: unique('products_rn_ext_id_uniq').on(table.rn, table.externalProductId),
  attributesGinIdx: index('products_attributes_gin_idx').using('gin').on(table.attributes),
})
```

**Rationale**: Standard Drizzle ORM syntax for PostgreSQL GIN indexes. Matches the `index()` import already used in `product-chunks.ts`.

---

## Decision 5: Attribute Name Enrichment Strategy

**Decision**: During product import, if the product API response's `attributes` array items don't include names, resolve them from the `product_attributes` table (already imported in the same session). Store `{ id, name }` pairs on the product.

**Simpler alternative**: Just store `id` only and join at read time — rejected because search text builder would need extra queries per product.

**Even simpler**: Accept that name may be empty and populate via re-import — acceptable fallback, but enrichment at import time is preferred.

---

## Decision 6: Scoring Weight

**Decision**: Attribute slot match bonus = `+10` per matching attribute (same as tag bonus, lower than ingredient bonus of `+15`). Consistent with existing pattern in `HybridRetrieverService`.

**Rationale**: Attributes are less granular than ingredients but similar in specificity to tags.
