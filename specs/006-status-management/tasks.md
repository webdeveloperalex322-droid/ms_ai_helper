# Tasks: Status Management for Cities and Products

**Input**: Design documents from `specs/006-status-management/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [data-model.md](data-model.md), [research.md](research.md), [contracts/status-management.md](contracts/status-management.md)

**Organization**: Tasks grouped by phase. Phases 1–2 are foundational (block all user stories). Phases 3–5 map to US1/US2/US3 from spec.md.

---

## Phase 1: Foundational — DB Migration

**Purpose**: Add `products.isActive` field. Blocks US2 SQL filter and admin work.

**⚠️ CRITICAL**: Must complete before any Phase 2 SQL tasks.

- [x] T001 Add `isActive: boolean('is_active').notNull().default(true)` to products table in `src/database/schema/products.ts`
- [x] T002 Run `pnpm db:generate` to generate migration, then `pnpm db:migrate` to apply — verify all product rows have `is_active = true`

**Checkpoint**: `products.is_active` column exists; all rows = `true`; TypeScript type includes `isActive: boolean`.

---

## Phase 2: Foundational — API Enforcement (SQL Filters + Orchestrator)

**Purpose**: Enforce city and product active status at query level. Implements API-side behavior for US1 + US2.

**⚠️ CRITICAL**: Blocks US1/US2 acceptance testing. Must complete before user story phases.

- [x] T003 [P] Add `cities.isActive = true` and `products.isActive = true` SQL filters to `src/modules/rag/services/vector-search.service.ts` — join `cities` on `city_products.br = cities.br` and `products` on `city_products.product_id = products.id`; add WHERE conditions for both `isActive` fields
- [x] T004 [P] Add same `cities.isActive` and `products.isActive` SQL filters to `src/modules/rag/services/keyword-search.service.ts` (both main full-text path and ILIKE fallback path)
- [x] T005 [P] Add same `cities.isActive` and `products.isActive` SQL filters to `src/modules/catalog/services/catalog.service.ts` — in `findByCity()` method; already has products JOIN, add cities JOIN + both WHERE conditions
- [x] T016 Inspect `src/modules/assistant/dto/product-answer.response.dto.ts` — confirm DTO supports empty `cards: []` and empty `answer: ''` without validation errors; if not, patch DTO to allow empty values before proceeding to T006/T007
- [x] T006 Add pre-flight city active check in `src/modules/assistant/services/assistant-orchestrator.service.ts` — before shortlist build: query `cities.isActive` for requested `br`; if `false`, return `{ cards: [], answer: '' }` (empty response, HTTP 200, no FallbackService)
- [x] T007 Add pre-flight active products count check in `src/modules/assistant/services/assistant-orchestrator.service.ts` — after city check: count products WHERE `isActive=true` JOIN city_products for `(rn, br, target)` WHERE `isAvailable=true`; if count = 0, return `{ cards: [], answer: '' }`

**Checkpoint**: API returns empty cards array (not FallbackService message) when city or all products are disabled. SQL queries exclude inactive entities.

---

## Phase 3: User Story 1 — Disable a City (Priority: P1) 🎯 MVP

**Goal**: Operator can toggle `cities.isActive` via admin panel; disabled city immediately stops appearing in API.

**Independent Test**: Toggle city to `isActive = false` in admin → call `POST /v1/assistant/product-answer` with that `br` → response: `{ "cards": [] }`. Re-enable → products return.

- [x] T008 [US1] Enable edit action in `src/modules/admin/resources/cities.resource.ts` — add `edit` to allowed actions; set `isActive` property as editable (`isEditable: true`); all other fields stay read-only (keep `isVisible: { edit: false }` on all non-isActive fields)

**Checkpoint**: Admin → Cities → any city → Edit → toggle `isActive` → Save works. API immediately reflects change.

---

## Phase 4: User Story 2 — Disable a Product (Priority: P2)

**Goal**: Operator can toggle `products.isActive` via admin panel; disabled product excluded from all API responses globally.

**Independent Test**: Toggle product to `isActive = false` in admin → call product-answer API for any city → product absent from `cards[]`. Re-enable → product reappears.

- [x] T009 [US2] Add `isActive` field to `src/modules/admin/resources/products.resource.ts` — add to properties list with `isVisible: { list: true, filter: true, show: true, edit: true }`; add `is_active` to list columns and filter fields

**Checkpoint**: Admin → Products → any product → Edit → toggle `isActive` → Save works. API excludes disabled product from all city responses.

---

## Phase 5: User Story 3 — View and Filter Status in Admin (Priority: P3)

**Goal**: Operator can filter cities/products by active status in admin list views.

**Independent Test**: Apply filter `isActive = false` in admin Cities list → only inactive cities shown. Same for Products list.

- [x] T010 [US3] Verify `src/modules/admin/resources/cities.resource.ts` filter on `is_active` works after edit action added in T008 — smoke test: apply filter in admin UI, confirm only matching records shown
- [x] T011 [US3] Verify `src/modules/admin/resources/products.resource.ts` filter on `is_active` works after T009 — smoke test: apply filter in admin UI, confirm only matching records shown

**Note**: `is_active` filter already exists for cities resource; products filter is added in T009. This phase is primarily verification.

**Checkpoint**: All three user stories independently functional.

---

## Phase 6: Polish & Tests

**Purpose**: Test coverage, regression checks, validation.

- [x] T012 [P] Update existing tests in `src/modules/rag/tests/` that mock vector-search or keyword-search queries — add `isActive = true` expectations to SQL snapshots/mocks
- [ ] T013 [P] Add unit tests for orchestrator pre-flight in `src/modules/assistant/` — test: city `isActive=false` → empty response; test: zero active products → empty response; test: both active → pipeline continues
- [x] T014 Run `pnpm test` full suite — fix any test failures from SQL filter changes in T003–T007; confirm `src/modules/catalog-import/tests/product-import.spec.ts` still passes (validates FR-006/FR-007 import skip behavior)
- [x] T017 Import regression: with a seeded inactive city, call `getActiveBrs(rn)` directly (or via import trigger) and assert that `br` is excluded from returned list; assert no `city_products` rows inserted for that `br` after full import run — covers FR-006 + FR-007 + SC-003
- [ ] T015 Manual validation: run all 4 scenarios from [quickstart.md](quickstart.md) against dev server

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1** (DB migration): No dependencies — start immediately
- **Phase 2** (API enforcement): Depends on T001–T002 (needs `products.isActive` column + type)
- **Phase 3** (US1 admin): Can start after T001–T002 (cities resource has no dependency on SQL filters; admin toggle works independently)
- **Phase 4** (US2 admin): Depends on T001–T002 (products.isActive must exist in schema/type)
- **Phase 5** (US3 verification): Depends on T008 (US1 edit) + T009 (US2 admin field)
- **Phase 6** (tests): Depends on T003–T009 all complete

### User Story Dependencies

- **US1 (P1)**: Admin edit (T008) can start after T001–T002; API enforcement via T003–T007
- **US2 (P2)**: Admin edit (T009) can start after T001–T002; API enforcement shared with US1 via T003–T007
- **US3 (P3)**: Depends on T008 + T009 being complete (verification only)

### Parallel Opportunities

Within Phase 2 — T003, T004, T005 touch different files, run in parallel:
```
T003: vector-search.service.ts
T004: keyword-search.service.ts
T005: catalog.service.ts
```

T016 (DTO check) must complete before T006/T007.

T006 and T007 both edit `assistant-orchestrator.service.ts` — run **sequentially**.

T008 (US1 admin) and T009 (US2 admin) touch different files — run in parallel after T001–T002:
```
T008: cities.resource.ts
T009: products.resource.ts
```

Phase 6: T012 and T013 are parallel (different test files).

---

## Implementation Strategy

### MVP (User Story 1 Only)

1. T001–T002: DB migration
2. T003–T007: API enforcement (SQL filters + orchestrator pre-flight)
3. T008: Cities admin edit
4. **STOP**: Validate — disable city in admin, call API, verify empty response

### Incremental Delivery

1. Phase 1 → Phase 2 → Phase 3: City status management fully working
2. Add Phase 4: Product status management
3. Add Phase 5: Filter verification
4. Phase 6: Tests and cleanup

---

## Notes

- `[P]` = parallelizable (different files, no shared state)
- `[US1/US2/US3]` = user story traceability
- SQL filter changes in T003–T005 cover BOTH cities and products isActive in one pass per file
- Cities import layer (`getActiveBrs()`) already correct — no import-layer tasks needed
- Empty response shape `{ cards: [], answer: '' }` must match existing `ProductAnswerResponseDto` — verify DTO before T006
