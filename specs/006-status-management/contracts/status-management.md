# Contracts: Status Management

**Feature**: 006-status-management
**Date**: 2026-07-04

---

## 1. Admin Panel — City Status Toggle

**Resource**: Cities (`/admin/cities`)

### Before (current)
- All actions disabled (new/edit/delete)
- `isActive` visible in list and filter, but not editable

### After
- Edit action enabled
- Editable fields: `isActive` only
- All other fields remain read-only
- Filter by `isActive` (already exists) unchanged

**Behavior contract**:
- `PATCH /admin/api/resources/cities/records/{id}/edit` with `{ isActive: false }` → city record updated → immediate effect on API (no cache)
- No confirmation dialog (MVP)
- `is_active` column visible in list view with boolean display

---

## 2. Admin Panel — Product Status Toggle

**Resource**: Products (`/admin/products`)

### Before (current)
- Editable: name, description, ingredients, allergens, tags
- No `isActive` field

### After
- Editable: name, description, ingredients, allergens, tags, **isActive**
- `isActive` visible in list and filter views
- Filter by `isActive` available in list

**Behavior contract**:
- `PATCH /admin/api/resources/products/records/{id}/edit` with `{ isActive: false }` → product excluded from all API responses immediately
- Import does not overwrite `isActive` — operator-set value is preserved across import runs

---

## 3. Product Answer API — Status Filtering

**Endpoint**: `POST /v1/assistant/product-answer`

**Pre-flight checks** (before shortlist build):

```
1. Check cities.isActive for requested br
   → false: return { cards: [], answer: '', type: 'empty' }

2. Count products WHERE isActive=true AND exists in city_products for (rn, br, target)
   → 0: return { cards: [], answer: '', type: 'empty' }

3. Continue normal pipeline
```

**SQL filter additions** (applied in all three query services):

```sql
-- VectorSearchService, KeywordSearchService, CatalogService.findByCity()
AND cities.is_active = true          -- join cities ON city_products.br = cities.br
AND products.is_active = true        -- join products ON city_products.product_id = products.id
```

**Empty response shape** (HTTP 200):
```json
{
  "cards": [],
  "answer": ""
}
```
(or whatever the existing empty response DTO shape is — no new field needed)

---

## 4. Import Layer (no changes)

`getActiveBrs()` in `product-import.service.ts` already filters `cities.isActive = true`.
Category import already filters similarly.
No contract changes needed.
