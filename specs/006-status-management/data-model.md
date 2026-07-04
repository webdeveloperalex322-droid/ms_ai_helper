# Data Model: Status Management

**Feature**: 006-status-management
**Date**: 2026-07-04

---

## Schema Changes

### products table — new field

```typescript
// src/database/schema/products.ts  (add to existing table definition)
isActive: boolean('is_active').notNull().default(true),
```

**Migration**: `pnpm db:generate` after schema edit → `pnpm db:migrate`

Default `true` ensures all existing products remain active after migration. No backfill needed.

---

## No Changes

| Table | Reason |
|-------|--------|
| `cities` | `isActive` already exists |
| `city_products` | `isAvailable`/`isValid` are different concerns; not touched |

---

## Field Semantics

| Field | Table | Set by | Meaning |
|-------|-------|--------|---------|
| `cities.isActive` | cities | Operator (admin) | Whether this city participates in API + import |
| `products.isActive` | products | Operator (admin) | Whether this product appears in any city's API response |
| `city_products.isAvailable` | city_products | Import | Whether product is currently in stock at this city |
| `city_products.isValid` | city_products | Import | Whether import data for this city-product is valid |

`products.isActive` is orthogonal to `city_products.isAvailable`:
- `isActive = false` → operator explicitly hidden (never shown)
- `isAvailable = false` → temporarily out of stock (set by import, can restore without operator action)

---

## Index

No new index needed on `products.isActive`. Filter on this column will always be combined with `rn`/`br`/`target` joins that use existing indexes. The selectivity is low (most products active) so a partial index is not warranted.

---

## State Transitions

### City

```
isActive = true  ←→  isActive = false
  (operator toggle via admin panel)
  (import never changes this field)
```

### Product

```
isActive = true  ←→  isActive = false
  (operator toggle via admin panel)
  (import never changes this field)
```
