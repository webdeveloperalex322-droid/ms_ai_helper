# Tasks: Admin Panel (AdminJS + Drizzle)

**Input**: Design documents from `specs/002-adminjs-admin-panel/`

**Prerequisites**: plan.md ✓ spec.md ✓ research.md ✓ data-model.md ✓ contracts/admin-panel.md ✓

**Tests**: Not requested — no test tasks generated.

**Organization**: Tasks grouped by user story. US1/US2/US3 are P1 and can proceed in parallel after Phase 2. US4 is P2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelizable (independent files, no incomplete deps)
- **[Story]**: User story label (US1–US4 from spec.md)

---

## Phase 1: Setup (Packages & Config)

**Purpose**: Install new dependencies, add env vars, scaffold module directories.

- [X] T001 Install npm packages: `pnpm add adminjs @adminjs/nestjs @adminjs/fastify @adminjs/sql @fastify/session @fastify/cookie knex` and verify peer deps
- [X] T002 Add `ADMIN_USER`, `ADMIN_PASSWORD`, `ADMIN_COOKIE_SECRET` to Zod schema in `src/config/configuration.ts` with optional defaults for test env
- [X] T003 [P] Create directory structure: `src/modules/admin/resources/` and `src/modules/admin/actions/`
- [X] T004 [P] Add `ADMIN_USER`, `ADMIN_PASSWORD`, `ADMIN_COOKIE_SECRET` placeholder vars to `.env.example`

**Checkpoint**: All packages installed, env schema validates, directories exist.

---

## Phase 2: Foundational (AdminJS Module + Auth)

**Purpose**: Working AdminJS mount with auth — no resources yet, just the `/admin` login page. Blocks all user stories.

**⚠️ CRITICAL**: No user story work until this phase is complete and `/admin/login` loads.

- [X] T005 Create `src/modules/admin/admin.module.ts` — dynamic imports of `adminjs`, `@adminjs/sql`, `@adminjs/fastify` (ESM packages); `buildAuthenticatedRouter` with Fastify instance; session config; `authenticate` callback reading `ADMIN_USER`/`ADMIN_PASSWORD` from `ConfigService`; all resources registered
- [X] T006 Register `AdminModule` in `src/app.module.ts` imports array
- [X] T007 Start dev server (`pnpm start:dev`) and verify `/admin/login` renders, login with env credentials succeeds, `/admin` dashboard loads

**Checkpoint**: `http://localhost:3000/admin` shows dashboard after login. Auth rejects wrong password.

---

## Phase 3: User Story 1 — Catalog View & Edit (P1) 🎯 MVP

**Goal**: Admin sees products and city_products, filters by city/network, edits availability flags and product metadata.

**Independent Test**: Login → Products → filter by `rn` → edit `description` field → Save → verify DB updated. City Products → toggle `is_available` → assistant no longer returns that product.

### Implementation

- [X] T008 [P] [US1] Create `src/modules/admin/resources/products.resource.ts` — `db.table('products')`, disable `new`/`delete` actions, editable: `name`, `description`, `ingredients`, `allergens`, `tags`; Russian labels; list columns: `name`, `category_name`, `rn`, `updated_at`
- [X] T009 [P] [US1] Create `src/modules/admin/resources/city-products.resource.ts` — `db.table('city_products')`, disable `new`/`delete` actions, editable: `is_available`, `is_valid`, `invalid_reason`; filters: `rn`, `br`, `target`, `is_available`, `is_valid`
- [X] T010 [US1] Register `productsResource(db)` and `cityProductsResource(db)` in `admin.module.ts` resources array
- [ ] T011 [US1] Manually verify quickstart.md Scenario 2 (product edit) and Scenario 3 (city product availability toggle) pass

**Checkpoint**: Products list + city_products list navigable in admin UI. Field edit saves to DB.

---

## Phase 4: User Story 2 — Import Trigger & Monitoring (P1)

**Goal**: Admin triggers city/product import from panel, sees job history with status.

**Independent Test**: Import Jobs → click "Trigger City Import" action → fill `rn` → confirm → new row appears in list with `status=running` → eventually `success`.

### Implementation

- [X] T012 [US2] Create `src/modules/admin/actions/trigger-import.action.ts` — two action factory functions (`createCityImportAction`, `createProductImportAction`); each calls `CityImportService.importCities` / `ProductImportService.importProducts`, returns `{ notice, redirectUrl }`
- [X] T013 [US2] Create `src/modules/admin/resources/import-jobs.resource.ts` — `db.table('import_jobs')`, disable all standard actions (`new`, `edit`, `delete`); register two custom resource actions from T012; list columns: `job_type`, `rn`, `br`, `status`, `started_at`, `finished_at`
- [X] T014 [US2] Inject `CityImportService` and `ProductImportService` into `admin.module.ts` constructor and pass to `importJobsResource(db, cityImportService, productImportService, defaultRn)`
- [ ] T015 [US2] Manually verify quickstart.md Scenario 6 (import trigger) passes — new job row appears in list

**Checkpoint**: Import Jobs section functional. Custom action triggers real import job.

---

## Phase 5: User Story 3 — Assistant Config (P1)

**Goal**: Admin edits banned phrases, max cards, priority products, tone rules without redeployment.

**Independent Test**: Admin Rules → add phrase to `banned_phrases` → save → `POST /v1/assistant/product-answer` → phrase absent from `reply_text`.

### Implementation

- [X] T016 [US3] Create `src/modules/admin/resources/admin-rules.resource.ts` — `db.table('admin_rules')`, full CRUD; `banned_phrases` and `fallback_templates` use `type: 'textarea'`; list columns: `rn`, `br`, `target`, `max_cards_in_response`, `updated_at`
- [X] T017 [US3] Register `adminRulesResource(db)` in `admin.module.ts` resources array
- [ ] T018 [US3] Manually verify quickstart.md Scenario 4 (banned phrase) passes end-to-end

**Checkpoint**: Admin Rules CRUD works. Banned phrase edit reflects in assistant responses.

---

## Phase 6: User Story 4 — Suggestions Management (P2)

**Goal**: Admin view/edit/toggle/reorder preset suggestions without redeployment.

**Independent Test**: Suggestions → set `enabled=false` on a suggestion → `GET /v1/assistant/suggestions` → suggestion absent from response.

### Implementation

- [X] T019 [US4] Create `src/modules/admin/resources/suggestions.resource.ts` — `db.table('assistant_suggestions')`, full CRUD; JSON fields as `type: 'textarea'`; list columns: `code`, `title`, `enabled`, `sort_order`, `target`, `updated_at`; filters: `rn`, `enabled`, `target`
- [X] T020 [US4] Register `suggestionsResource(db)` in `admin.module.ts` resources array
- [ ] T021 [US4] Manually verify quickstart.md Scenario 5 (toggle suggestion) passes

**Checkpoint**: Suggestions CRUD works. Toggle `enabled` reflects in `/suggestions` API response.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Read-only views, UX cleanup, hardening.

- [X] T022 [P] Create `src/modules/admin/resources/cities.resource.ts` — `db.table('cities')`, read-only (disable all mutations); list columns: `name`, `br`, `rn`, `is_active`; registered in `admin.module.ts`
- [X] T023 [P] Verify `raw_payload` fields are hidden in all resources (not shown in list or detail view) — set in products.resource.ts and city-products.resource.ts
- [ ] T024 [P] Verify access control matrix — unauthenticated request to `/admin/resources/*` redirects to login
- [ ] T025 Run all quickstart.md scenarios (1–7) and confirm pass
- [X] T026 [P] Update `.env.example` with final env var names and descriptions

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No deps — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — **BLOCKS all user stories**
- **Phase 3 (US1)**: Depends on Phase 2 only
- **Phase 4 (US2)**: Depends on Phase 2 only
- **Phase 5 (US3)**: Depends on Phase 2 only
- **Phase 6 (US4)**: Depends on Phase 2 only
- **Phase 7 (Polish)**: Depends on all P1 stories (Phases 3–5)

### User Story Dependencies

- US1, US2, US3 — independent, all P1, can implement in any order after Phase 2
- US4 (P2) — independent from US1–US3, can start after Phase 2 whenever US1–US3 done

### Within Each Phase

- T008 + T009 (Phase 3) — parallel, different files
- T012 precedes T013 (Phase 4) — action handler must exist before resource registers it
- T022 + T023 + T024 (Phase 7) — parallel, different concerns

---

## Parallel Opportunities

```
Phase 1 parallel: T003 + T004 (mkdir + .env.example)

Phase 2 sequential: T005 → T006 → T007

Phase 3 parallel start: T008 + T009 simultaneously → T010 → T011

Phase 4 sequential: T012 → T013 → T014 → T015

Phase 5 sequential: T016 → T017 → T018

Phase 6 sequential: T019 → T020 → T021

Phase 7 parallel: T022 + T023 + T024 simultaneously → T025 → T026
```

---

## Implementation Strategy

### MVP First (P1 Stories Only)

1. Phase 1: Setup ✓
2. Phase 2: Foundational ✓ (verify T007)
3. Phase 3: US1 (catalog) ✓ (verify T011)
4. Phase 4: US2 (import) ✓ (verify T015)
5. Phase 5: US3 (config) ✓ (verify T018)
6. **STOP**: All P1 stories done. Admin panel operational.

### Full Delivery (P1 + P2)

7. Phase 6: US4 (suggestions) ✓ (verify T021)
8. Phase 7: Polish ✓ (verify T024–T025)

### Single-Dev Sequence

T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018 → T019 → T020 → T021 → T022 → T023 → T024 → T025 → T026

---

## Notes

- No DB migrations — admin panel uses existing tables only
- Adapter: `@adminjs/sql` with `Adapter('postgresql', { connectionString, database })` — requires `knex` as peer dep
- Dynamic imports used for `adminjs`, `@adminjs/sql`, `@adminjs/fastify` — all are pure ESM, incompatible with TypeScript `"module": "commonjs"` static imports
- Session cookie requires `@fastify/cookie` registered **before** `@fastify/session` — handled by `buildAuthenticatedRouter` internally
- `raw_payload` columns: set `isVisible: { list: false, show: false, edit: false, filter: false }` in all resources
- Test env: new Zod vars use `.optional().default(...)` to avoid breaking `pnpm test`
