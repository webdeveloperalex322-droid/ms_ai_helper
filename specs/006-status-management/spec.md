# Feature Specification: Status Management for Cities and Products

**Feature Branch**: `006-status-management`

**Created**: 2026-07-03

**Status**: Draft

**Input**: User description: "Add status field to products and cities/branches. Disabled city stops participating in API and product import. Disabled product stops participating in API responses."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Disable a City/Branch (Priority: P1)

An operator opens the admin panel and disables a city (branch). After that, the city no longer appears in API product queries, and future product import jobs skip that city entirely.

**Why this priority**: Core business need — operators must be able to stop serving a city without deleting data. All downstream effects (API silence + import skip) follow from this one toggle.

**Independent Test**: Toggle a city to inactive in admin, run a product query for that `br`, verify zero results. Then trigger import job, verify no products are imported for that `br`.

**Acceptance Scenarios**:

1. **Given** a city with `isActive = true`, **When** operator sets it to `isActive = false` via admin panel, **Then** the city record is saved with `isActive = false` and admin UI reflects the change.
2. **Given** a city with `isActive = false`, **When** a client calls the product-answer API with that city's `br`, **Then** the response returns no products (empty or fallback).
3. **Given** a city with `isActive = false`, **When** a product import job runs, **Then** the import skips that city and logs it as skipped (no products imported for that `br`).
4. **Given** a city with `isActive = false` that is re-enabled (`isActive = true`), **When** a product query is made, **Then** products for that city appear again in results.

---

### User Story 2 — Disable a Product (Priority: P2)

An operator disables a specific product from the admin panel. The product is no longer returned in any API product-answer or catalog responses, regardless of which city is queried.

**Why this priority**: Lets operators hide individual products (e.g., seasonal items, out-of-assortment) without deleting them or affecting city status.

**Independent Test**: Disable a product in admin, call product-answer API for any city that previously returned that product, verify it is absent from results.

**Acceptance Scenarios**:

1. **Given** a product with `isActive = true`, **When** operator sets it to `isActive = false` via admin panel, **Then** the product record is saved with `isActive = false`.
2. **Given** a product with `isActive = false`, **When** the product-answer API is called and that product would otherwise match, **Then** the product does not appear in the response cards.
3. **Given** a product with `isActive = false`, **When** hybrid search or catalog lookup runs, **Then** the product is excluded from candidate shortlist.
4. **Given** a product with `isActive = false` that is re-enabled, **When** the API is called, **Then** the product appears in results again.

---

### User Story 3 — View and Filter Status in Admin (Priority: P3)

An operator can filter cities or products by their active/inactive status in the admin panel to quickly audit which entities are disabled.

**Why this priority**: Operational visibility — operators need to see what is currently disabled without querying the database directly.

**Independent Test**: In admin cities list, apply filter `isActive = false`, verify only inactive cities appear.

**Acceptance Scenarios**:

1. **Given** a mix of active and inactive cities, **When** operator filters by `isActive = false` in the admin cities list, **Then** only inactive cities are shown.
2. **Given** a mix of active and inactive products, **When** operator filters by `isActive = false` in the admin products list, **Then** only inactive products are shown.

---

### Edge Cases

- What if all products in a city are disabled — does the API return a fallback response or an empty list?
- What if a city is enabled but all its products are disabled — same question.
- What happens during import when a city is re-enabled after being disabled — does import resume on next run?
- Does disabling a city affect category import as well as product import?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Admin panel MUST allow operators to toggle `isActive` for any city record (currently read-only).
- **FR-002**: Admin panel MUST allow operators to toggle `isActive` for any product record (new field).
- **FR-003**: Product-answer API MUST exclude products belonging to cities where `isActive = false`.
- **FR-004**: Product-answer API MUST exclude products where `products.isActive = false`.
- **FR-005**: Catalog queries (hybrid search, shortlist builder) MUST apply both city and product active filters.
- **FR-006**: Product import job MUST skip cities where `isActive = false` (currently implemented via `getActiveBrs()`; must remain enforced).
- **FR-007**: Category import job MUST also skip inactive cities (currently implemented; must remain enforced).
- **FR-008**: Admin panel MUST display `isActive` status for cities and products in list views with filter capability.
- **FR-009**: Disabling then re-enabling a city or product MUST restore full participation in API and next import run without additional manual steps.

### Key Entities

- **City** (`cities` table): Already has `isActive: boolean` field. Needs admin edit capability and API-level enforcement.
- **Product** (`products` table): Needs new `isActive: boolean` field (default `true`). Needs admin edit capability and query-level enforcement.
- **CityProduct** (`city_products` table): Existing `isAvailable` / `isValid` are per-city availability flags (different concern from admin-controlled status). Not modified by this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After disabling a city in admin, subsequent API calls for that city's `br` return no products within one request (no cache lag).
- **SC-002**: After disabling a product in admin, the product does not appear in any city's API response within one request.
- **SC-003**: Import job run after disabling a city produces zero imported products for that city's `br` and logs the skip.
- **SC-004**: All existing API responses for active cities and products are unaffected (no regression in product count or quality).
- **SC-005**: Admin operator can locate and toggle status of any city or product in under 30 seconds via the admin panel UI.

## Assumptions

- City `isActive` field already exists in schema and is persisted during import — only API filtering and admin editability need to be added for cities.
- Product `isActive` is a global flag (disables across all cities/branches), not per-city — per-city availability is already handled by `cityProducts.isAvailable`.
- Default for new `products.isActive` field is `true` (all existing products remain active after migration).
- Import does not change `products.isActive` — it is set only by operators via admin panel.
- No REST API endpoint outside AdminJS is needed for toggling status (admin panel is sufficient for MVP).
- Fallback behavior when all products are filtered out follows existing fallback logic in `FallbackService`.
