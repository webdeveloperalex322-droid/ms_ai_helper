# Data Model: Product Attributes System

## New Table: `product_attributes`

Stores the attribute catalog fetched from the Venus API.

```typescript
// src/database/schema/product-attributes.ts
export const productAttributes = pgTable(
  'product_attributes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rn: uuid('rn').notNull(),
    externalId: text('external_id').notNull(),   // attribute UUID from API
    name: text('name').notNull(),                // e.g. "42 шт.", "Пицца 35 см"
    groupName: text('group_name'),               // e.g. "Representation"
    isActive: boolean('is_active').notNull().default(true),
    rawPayload: jsonb('raw_payload'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    rnExternalIdUniq: unique('product_attributes_rn_ext_id_uniq').on(table.rn, table.externalId),
    rnIdx: index('idx_product_attributes_rn').on(table.rn),
  }),
);

export type ProductAttribute = typeof productAttributes.$inferSelect;
export type NewProductAttribute = typeof productAttributes.$inferInsert;
```

## Modified Table: `products`

Add `attributes` JSONB column and GIN index.

```typescript
// Added to src/database/schema/products.ts
attributes: jsonb('attributes').$type<ProductAttributeValue[]>().default([]),

// Added to third-argument (table constraints):
attributesGinIdx: index('products_attributes_gin_idx').using('gin').on(table.attributes),
```

## Shared Types

```typescript
// In catalog-api.client.interface.ts

/** Single attribute value as stored on a product record. */
export interface ProductAttributeValue {
  id: string;     // attribute externalId (UUID string)
  name: string;   // human-readable label e.g. "42 шт."
}

/** One attribute entry from the /v1/attributes/PRODUCT catalog endpoint. */
export interface AttributeApiResponse {
  id: string;
  type?: string;
  attribute: {
    id: string;
    name: string;
    slug?: string;
    value?: string;
    backgroundColor?: string;
    textColor?: string;
    group?: {
      name: string;
      orderIndex?: number;
      localization?: unknown[];
    };
    localization?: unknown[];
    [key: string]: unknown;
  };
  _parent?: string;
  _createTime?: string;
  _updateTime?: string;
  [key: string]: unknown;
}
```

## Updated `ProductApiResponse`

```typescript
// Add to existing interface in catalog-api.client.interface.ts
export interface ProductApiResponse {
  // ... existing fields ...
  /** Attribute badges/labels assigned to this product. */
  attributes?: Array<{ id: string; name?: string; [key: string]: unknown }>;
}
```

## Entity Relationships

```
product_attributes
  id (PK)
  rn ──────────────────────────────────── rn (scoped to retail network)
  externalId (unique per rn)

products
  id (PK)
  rn
  attributes: jsonb ── [{id, name}] ───── loose reference to product_attributes.externalId
                                          (no FK — loosely coupled, catalog-first)
```

Loose coupling is intentional: products can store attribute values even if the catalog hasn't been imported yet (or vice versa). No cascading deletes needed.

## Migration Output

`pnpm db:generate` produces one migration with:
1. `CREATE TABLE product_attributes (...)` with unique constraint and rn index
2. `ALTER TABLE products ADD COLUMN attributes jsonb DEFAULT '[]'::jsonb`
3. `CREATE INDEX products_attributes_gin_idx ON products USING gin(attributes)`
