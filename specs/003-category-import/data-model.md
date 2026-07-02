# Phase 1 Data Model: Category Import

## New table: `categories`

Drizzle schema at `src/database/schema/categories.ts`, re-exported from `schema/index.ts`.

| Column          | Type                | Notes                                                        |
|-----------------|---------------------|-------------------------------------------------------------|
| `id`            | uuid PK             | `defaultRandom()`                                            |
| `rn`            | uuid NOT NULL       | retail network                                              |
| `br`            | uuid NOT NULL       | business region (from `/v1/init` `businessRegion.id`)      |
| `target`        | text NOT NULL       | channel, e.g. `WEB`                                         |
| `categoryId`    | text NOT NULL       | source category identity (GUID, e.g. `5E2E45E0-...`)       |
| `slug`          | text NOT NULL       | addressing key used in product `category=` param (`rolly`) |
| `name`          | text NOT NULL       | display name (`Роллы и суши`)                              |
| `parentId`      | text                | parent reference (`0` for top-level)                       |
| `orderIndex`    | integer             | ordering within the city                                   |
| `classifierId`  | integer             | source classifier id                                       |
| `isDefault`     | boolean NOT NULL default false | virtual/aggregate flag (`main`, `new`)          |
| `iconUrl`       | text                |                                                             |
| `imageUrl`      | text                |                                                             |
| `isActive`      | boolean NOT NULL default true  | set false when unseen in latest fetch          |
| `rawPayload`    | jsonb               | full source object                                         |
| `importedAt`    | timestamp NOT NULL default now |                                                |

**Constraints / indexes**
- Unique `categories_rn_br_target_cat_uniq` on `(rn, br, target, categoryId)` — upsert conflict target.
- Index `categories_lookup_idx` on `(rn, br, target, isActive)` — product-import slug selection.

**Validation rules**
- A row is only stored when `slug` and `name` are present (skip + count error otherwise).
- `isDefault` derived from source `isDefault` (fallback: `parentId == 0` treated as candidate virtual only if source marks default).

## Extended table: `cities` (existing)

Add one nullable column:

| Column | Type | Notes |
|--------|------|-------|
| `slug` | text | canonical city slug from `/v1/cities` (e.g. `tyumen`). Nullable to allow backfill. |

- Populated by city import normalizer from `CityApiResponse.slug`.
- Backfilled on re-import via existing UPSERT on `(rn, br)`.

## Relationships

- `categories.slug` → used as the `category=` filter value against the product endpoint; logically links a category to the products returned for it. No DB-level FK (products key on their own `rn + externalProductId`).
- `categories.(rn, br, target)` → same tuple that keys `cities` (`rn, br`) and `city_products` (`rn, br, target`).

## State transitions

- **New category** in source → inserted `isActive=true`.
- **Existing category** re-seen → updated in place (name/slug/order/urls/rawPayload refreshed), `isActive=true`, `importedAt` bumped.
- **Category absent** from a non-empty fetch → `isActive=false` (soft-retire).
- **Empty fetch** for a city → no `isActive` changes (safety guard).

## Import Job (existing `import_jobs`, reused)

- `jobType = 'category_import'`, `rn`, `target`, `status` (`running`→`success`/`failed`), `stats = { imported, errors, cities }`.
