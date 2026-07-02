---
description: "Task list for Category Import feature"
---

# Tasks: Category Import

**Input**: Design documents from `specs/003-category-import/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included (plan requests vitest coverage for the new/changed code paths).

**Organization**: Grouped by user story. All paths relative to repo root.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (all-cities category import), US2 (product import uses slugs), US3 (city slug capture)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No new tooling needed — existing NestJS/Drizzle/Vitest project. Confirm baseline.

- [X] T001 Confirm `.env` has `CATALOG_API_MODE`, `CITIES_API_BASE_URL`, `CATALOG_API_BASE_URL` (no schema change needed) — verify in [src/config/configuration.ts](src/config/configuration.ts)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: DB schema + client contract that every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Create `categories` table schema in [src/database/schema/categories.ts](src/database/schema/categories.ts) per [data-model.md](specs/003-category-import/data-model.md) (columns, unique `(rn,br,target,categoryId)`, lookup index `(rn,br,target,isActive)`; export `categories`, `Category`, `NewCity`-style `NewCategory` types)
- [X] T003 Add `slug: text('slug')` column to [src/database/schema/cities.ts](src/database/schema/cities.ts)
- [X] T004 Re-export `categories` from [src/database/schema/index.ts](src/database/schema/index.ts)
- [X] T005 Generate migration: run `pnpm db:generate`, verify new SQL under [src/database/migrations](src/database/migrations) creates `categories` + adds `cities.slug`; apply with `pnpm db:migrate`
- [X] T006 Extend client contract in [catalog-api.client.interface.ts](src/modules/catalog-import/clients/catalog-api.client.interface.ts): add `CategoryApiResponse`, `getCategories(rn, slug, target): Promise<{ br: string; categories: CategoryApiResponse[] }>`, and add `slug?: string` to `CityApiResponse` (per [contracts/catalog-api-client.md](specs/003-category-import/contracts/catalog-api-client.md))

**Checkpoint**: Schema migrated, client interface extended — stories can begin.

---

## Phase 3: User Story 3 - City slug captured during city import (Priority: P2, prerequisite for US1 all-cities)

**Goal**: Each imported city stores its slug so `/v1/init` can be addressed per city.

**Independent Test**: Run city import; every stored city row has `slug` populated.

- [X] T007 [P] [US3] Map `slug: cityData.slug` into the `NewCity` object in `importCities` normalizer, [city-import.service.ts](src/modules/catalog-import/services/city-import.service.ts); ensure UPSERT on `(rn,br)` updates `slug` (backfill)
- [X] T008 [US3] Add city-slug assertion to city import test in [city-import.spec.ts](src/modules/catalog-import/tests/city-import.spec.ts) (mock city returns slug → stored)

**Checkpoint**: Cities carry slug; all-cities category import is now addressable.

---

## Phase 4: User Story 1 - Import categories for all cities (Priority: P1) 🎯 MVP

**Goal**: Fetch + persist categories per city from `/v1/init`, across all active cities or one slug.

**Independent Test**: Trigger `POST /v1/import/categories`; categories persisted per city with slug/name/order/isDefault; re-run does not duplicate.

### Tests for User Story 1 ⚠️ (write first, expect fail)

- [X] T009 [P] [US1] Add `getCategories` coverage to [mock-client.spec.ts](src/modules/catalog-import/tests/mock-client.spec.ts) (returns br + categories incl. one `isDefault`)
- [X] T010 [P] [US1] Create [category-import.spec.ts](src/modules/catalog-import/tests/category-import.spec.ts): import populates `categories`, job marked `success` with `{imported,errors,cities}`, upsert idempotent (re-run no duplicates), empty fetch does not deactivate

### Implementation for User Story 1

- [X] T011 [P] [US1] Implement `getCategories` in [catalog-api-mock.client.ts](src/modules/catalog-import/clients/catalog-api-mock.client.ts): hardcoded `br` + categories whose slugs match mock products, ≥1 `isDefault: true`
- [X] T012 [P] [US1] Implement `getCategories` in [catalog-api-http.client.ts](src/modules/catalog-import/clients/catalog-api-http.client.ts): `GET ${citiesBaseUrl}/v1/init?rn=&slug=&target=`, return `{ br: data.businessRegion.id, categories: data.categories ?? [] }`
- [X] T013 [US1] Create [category-import.service.ts](src/modules/catalog-import/services/category-import.service.ts): `importCategories({rn,target,slug?})` — resolve cities (single slug or active cities w/ non-null slug), `ImportJobService.create({jobType:'category_import'})`, `fetchWithRetry` (3× exp backoff), upsert on `(rn,br,target,categoryId)`, `markUnseen`→`isActive=false` (skip when 0 fetched), cancellation via `importJobService.exists(jobId)`, per-city errors counted not thrown, `markSuccess`/`markFailed` with `{imported,errors,cities}` (mirror [city-import.service.ts](src/modules/catalog-import/services/city-import.service.ts))
- [X] T014 [US1] Add `ImportCategoriesDto { rn; target?='WEB'; slug? }` + `POST /v1/import/categories` handler in [import.controller.ts](src/modules/catalog-import/controllers/import.controller.ts) returning `{ job_id, status, stats }` (per [contracts/import-categories.endpoint.md](specs/003-category-import/contracts/import-categories.endpoint.md))
- [X] T015 [US1] Register `CategoryImportService` as provider in [catalog-import.module.ts](src/modules/catalog-import/catalog-import.module.ts)

**Checkpoint**: Categories import end-to-end; job tracked; idempotent.

---

## Phase 5: User Story 2 - Product import uses real category slugs (Priority: P1)

**Goal**: Product import requests products with correct `category={slug}` param, iterating stored non-default slugs.

**Independent Test**: With categories imported, run product import for a city → products returned; virtual/default categories not used; wrong `cat=` param gone.

### Tests for User Story 2 ⚠️

- [X] T016 [P] [US2] Add HTTP-client regression test asserting `getProductsByCategory` URL contains `&category=` (not `&cat=`) — in [mock-client.spec.ts](src/modules/catalog-import/tests/mock-client.spec.ts) or a new http-client spec
- [X] T017 [P] [US2] Extend [product-import.spec.ts](src/modules/catalog-import/tests/product-import.spec.ts): `importFull` selects stored non-default slugs, skips `isDefault`, falls back to `DEFAULT_CATEGORY_IDS` + warns when none stored, honors explicit `categoryIds`

### Implementation for User Story 2

- [X] T018 [US2] Fix param bug in [catalog-api-http.client.ts](src/modules/catalog-import/clients/catalog-api-http.client.ts) `getProductsByCategory`: `&cat=${categoryId}` → `&category=${categorySlug}`
- [X] T019 [US2] In [product-import.service.ts](src/modules/catalog-import/services/product-import.service.ts) `importFull`: per BR load category slugs from `categories` (`WHERE rn,br,target,isActive AND NOT isDefault` ordered by `orderIndex`); use in place of `DEFAULT_CATEGORY_IDS`; fallback to `DEFAULT_CATEGORY_IDS` + `logger.warn` when empty; keep honoring request `categoryIds` override (now slugs)

**Checkpoint**: Real-mode product import returns products (was empty before).

---

## Phase 6: Polish & Cross-Cutting

- [X] T020 Run full suite: `pnpm vitest run src/modules/catalog-import` then `pnpm test`; `pnpm lint`
- [X] T021 Execute [quickstart.md](specs/003-category-import/quickstart.md) real-mode validation (cities→categories→products for Tyumen `br=E3AFD1AC-4D3D-EA11-A958-8B023DE8EF69`)

---

## Dependencies & Execution Order

- **Phase 1 (Setup)**: immediate.
- **Phase 2 (Foundational)**: T002→T004→T005 (schema then migrate); T006 parallel to schema. BLOCKS all stories.
- **Phase 3 (US3)**: after T002-T005 (needs `cities.slug`). Prereq for US1 all-cities path.
- **Phase 4 (US1)**: after Phase 2; all-cities mode needs US3 (T007). Single-slug mode testable without US3.
- **Phase 5 (US2)**: after Phase 2; consumes categories from US1 for real value but T018 (param fix) is independent.
- **Phase 6**: after all.

### Within stories

- Tests before implementation (write failing first).
- Schema (T002-T005) before any service using `categories`.
- Client method (T011/T012) before `CategoryImportService` (T013).
- Service (T013) before controller (T014) before module wiring (T015).

### Parallel opportunities

- T009/T010 [P] tests; T011/T012 [P] mock vs http client impls (different files).
- T016/T017 [P] US2 tests.
- T018 (param fix) can land independently of T019.

---

## Implementation Strategy

- **MVP**: Phase 2 → US3 (slug) → US1 (category import). Validates the import pipeline.
- **Full value**: add US2 so product import actually returns data (the core defect fix).
- Commit after each task or logical group; stop at checkpoints to validate.

---

## Notes

- No new env vars; `/v1/init` reuses `CITIES_API_BASE_URL`.
- Never hand-write SQL — migrations via `pnpm db:generate` only.
- Import endpoints must always return a result; per-city failures counted in `stats.errors`.
