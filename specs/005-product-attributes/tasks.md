# Tasks: Product Attributes System

**Input**: Design documents from `specs/005-product-attributes/`

**Prerequisites**: plan.md вњ“, spec.md вњ“, research.md вњ“, data-model.md вњ“, contracts/ вњ“, quickstart.md вњ“

**Tests**: Included for core services per NestJS project conventions (Vitest).

**Organization**: Tasks grouped by user story for independent delivery.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[Story]**: User story from spec.md
- All paths relative to repo root `src/`

---

## Phase 1: Setup (Shared Types & Schema)

**Purpose**: Establish shared types and database schema that all user stories depend on.

- [X] T001 Add `AttributeApiResponse`, `ProductAttributeValue` types and `getAttributes` method signature to `src/modules/catalog-import/clients/catalog-api.client.interface.ts`; add optional `attributes` field to `ProductApiResponse`
- [X] T002 [P] Create `src/database/schema/product-attributes.ts` вЂ” new `product_attributes` table with `id`, `rn`, `externalId`, `name`, `groupName`, `isActive`, `rawPayload`, `updatedAt`; unique `(rn, externalId)`
- [X] T003 [P] Modify `src/database/schema/products.ts` вЂ” add `attributes` jsonb column with default `[]` and GIN index `products_attributes_gin_idx`
- [X] T004 Export `productAttributes` from `src/database/schema/index.ts`
- [X] T005 Run `pnpm db:generate` then `pnpm db:migrate` to generate and apply the Drizzle migration (creates `product_attributes` table, adds `attributes` column + GIN index to `products`)

**вљ пёЏ CRITICAL**: T002, T003, T004 can run in parallel. T005 MUST run after all three complete and requires Docker/Postgres running.

**Checkpoint**: Migration applied, `product_attributes` table exists, `products.attributes` column exists, shared types defined.

---

## Phase 2: User Story 1 вЂ” Admin Imports Attribute Catalog (Priority: P1) рџЋЇ MVP

**Goal**: Admin can call `POST /v1/import/attributes` to fetch attribute catalog from Venus API and store in `product_attributes` table.

**Independent Test**: `POST /v1/import/attributes` returns `{ job_id, status: "completed", stats: { imported: N } }` where N > 0. DB query `SELECT * FROM product_attributes` returns rows.

### Implementation for US1

- [X] T006 [P] [US1] Implement `getAttributes(rn)` in `src/modules/catalog-import/clients/catalog-api-http.client.ts` вЂ” `GET /v1/attributes/PRODUCT?rn={rn}`, use existing UTF-8 force-encoding pattern
- [X] T007 [P] [US1] Implement `getAttributes(rn)` in `src/modules/catalog-import/clients/catalog-api-mock.client.ts` вЂ” return 3 hardcoded `AttributeApiResponse` entries (e.g. `{id: "mock-attr-001", attribute: {id: "mock-attr-001", name: "42 С€С‚.", group: {name: "Representation"}}}` etc.)
- [X] T008 [US1] Create `src/modules/catalog-import/services/attribute-import.service.ts` вЂ” `importAttributes(rn)` method: create ImportJob (`jobType: 'attribute_import'`), call `getAttributes(rn)`, upsert each to `product_attributes` on conflict `(rn, externalId)` updating `name/groupName/isActive/rawPayload/updatedAt`, mark job success/failed, return `{ jobId, imported }`
- [X] T009 [US1] Add `ImportAttributesDto` class, inject `AttributeImportService`, add `@Post('attributes')` endpoint to `src/modules/catalog-import/controllers/import.controller.ts` вЂ” returns `{ job_id, status, stats: { imported } }`
- [X] T010 [US1] Register `AttributeImportService` in `providers` and `exports` in `src/modules/catalog-import/catalog-import.module.ts`
- [X] T011 [US1] Write unit test for `AttributeImportService` in `src/modules/catalog-import/tests/attribute-import.service.spec.ts` вЂ” mock `CatalogApiClient`, verify upsert called with correct payload, verify job created and marked success

**Checkpoint**: `POST /v1/import/attributes` works end-to-end in mock mode. `product_attributes` rows created. Import job tracked.

---

## Phase 3: User Story 2 вЂ” Products Carry Attribute Values (Priority: P1)

**Goal**: After running product import, products in the DB have non-empty `attributes` column populated from API response.

**Independent Test**: Run `POST /v1/import/products`; query `SELECT name, attributes FROM products WHERE attributes != '[]'::jsonb LIMIT 5` returns rows.

### Implementation for US2

- [X] T012 [US2] Update `src/modules/catalog-import/clients/catalog-api-mock.client.ts` вЂ” add `attributes` array to at least 2 mock products referencing the 3 mock attribute IDs added in T007 (e.g. `attributes: [{ id: "mock-attr-001", name: "42 С€С‚." }]`)
- [X] T013 [US2] Update `ProductNormalizerService.normalize()` in `src/modules/catalog-import/services/product-normalizer.service.ts` вЂ” extract `raw.attributes ?? []`, map to `ProductAttributeValue[]` via `{ id: a.id, name: (a.name ?? '').trim() }`, add `attributes` field to returned `product` object
- [X] T014 [US2] Update `products` upsert `onConflictDoUpdate` set in `src/modules/catalog-import/services/product-import.service.ts` вЂ” add `attributes: normalized.product.attributes`
- [X] T015 [US2] Write unit test for normalizer attribute extraction in `src/modules/catalog-import/tests/product-normalizer.service.spec.ts` вЂ” test that `raw.attributes` maps to correct `ProductAttributeValue[]`, test empty/absent attributes produce `[]`

**Checkpoint**: Product import populates `attributes` column. Products without attributes store `[]`.

---

## Phase 4: User Story 3 вЂ” AI Assistant Finds Products by Attribute (Priority: P2)

**Goal**: After products are re-imported with attributes, the RAG pipeline includes attribute labels in searchable text and chunk metadata so attribute-based queries find matching products.

**Independent Test**: After import, query `SELECT searchable_text FROM product_chunks WHERE searchable_text LIKE '%РђС‚СЂРёР±СѓС‚С‹%' LIMIT 3` returns rows. AI query `POST /v1/assistant/product-answer` with attribute-related term returns relevant products.

### Implementation for US3

- [X] T016 [US3] Update `buildSearchableText()` in `src/modules/rag/services/searchable-text-builder.service.ts` вЂ” append `РђС‚СЂРёР±СѓС‚С‹: <comma-separated names>` block when `product.attributes` is non-empty; filter out blank names
- [X] T017 [US3] Update `buildMetadata()` in `src/modules/rag/services/searchable-text-builder.service.ts` вЂ” add `attributes: product.attributes ?? []` to returned metadata object
- [X] T018 [US3] Write unit test in `src/modules/rag/tests/searchable-text-builder.spec.ts` вЂ” verify attributes block appears in text, verify empty attributes produce no block, verify attribute values appear in metadata

**Checkpoint**: Product chunks include attribute text. Vector/keyword search can match attribute labels.

---

## Phase 5: User Story 4 вЂ” Attribute-Enhanced Scoring (Priority: P2)

**Goal**: HybridRetrieverService applies a +10 scoring bonus per product attribute that matches slots inferred from the user query.

**Independent Test**: Create two products вЂ” one with a specific attribute (e.g. "42 С€С‚."), one without вЂ” send a query that should surface the attribute; verify the first product scores higher.

### Implementation for US4

- [X] T019 [US4] Check whether `IntentSlots` type in the assistant module has an `attributes` field (or equivalent). If not, add optional `attributes?: string[]` to `IntentSlots` (or whatever the intent slot type is called) in the relevant interface file under `src/modules/assistant/`.
- [X] T020 [US4] Update the scoring logic in `src/modules/rag/services/hybrid-retriever.service.ts` вЂ” after existing slot-match scoring, add attribute match loop: for each item in `product.attributes`, if `intentSlots.attributes` contains a name substring match (case-insensitive), apply `+10` bonus per match; guard with `if (!intentSlots?.attributes?.length) skip`
- [X] T021 [US4] Write unit test in `src/modules/rag/tests/hybrid-retriever.service.spec.ts` (or existing spec file) вЂ” mock two products differing only in attributes, verify attribute-matched product scores higher

**Checkpoint**: Products with matching attributes rank higher in combined queries.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T022 [P] Run `pnpm lint` on all modified files; fix any lint errors
- [X] T023 Run `pnpm test` вЂ” confirm all new and existing tests pass
- [X] T024 [P] Update `docs/knowledge/` if applicable вЂ” add attribute system to module map or architecture notes
- [X] T025 Validate end-to-end per `specs/005-product-attributes/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup) вЂ” no dependencies, T002/T003/T004 run in parallel, T005 after all
Phase 2 (US1)  вЂ” needs Phase 1 complete (T001, T005)
Phase 3 (US2)  вЂ” needs Phase 1 complete (T001, T005); T007 must be done before T012
Phase 4 (US3)  вЂ” needs Phase 3 complete (T013 adds attributes to products)
Phase 5 (US4)  вЂ” needs Phase 4 complete (T017 adds attributes to metadata)
Phase 6 (Polish) вЂ” needs Phases 2-5 complete
```

### User Story Dependencies

- **US1 (P1)**: Can start immediately after Phase 1
- **US2 (P1)**: Can start immediately after Phase 1, independent of US1; but run T012 after T007 (mock data)
- **US3 (P2)**: Depends on US2 (products must have attributes before chunks are rebuilt)
- **US4 (P2)**: Depends on US3 (needs attributes in metadata)

### Within Each Phase

- Models/schema before services
- Services before endpoints
- HTTP + mock clients [P] вЂ” different files, parallel OK
- Controller depends on service (T009 after T008)

### Parallel Opportunities

- T002, T003, T004 вЂ” parallel (different schema files)
- T006, T007 вЂ” parallel (different client files)
- T016, T022, T024 вЂ” parallel (different files/concerns)

---

## Parallel Execution Example: Phase 2 (US1)

```
Parallel group A (T006, T007):
  Task: "Implement getAttributes in catalog-api-http.client.ts"
  Task: "Implement getAttributes in catalog-api-mock.client.ts"

Then sequential:
  T008: "Create attribute-import.service.ts" (needs T006/T007 API shape)
  T009: "Add POST /attributes endpoint to import.controller.ts" (needs T008)
  T010: "Register AttributeImportService in catalog-import.module.ts" (needs T008)
  T011: "Write unit test for AttributeImportService" (needs T008)
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup (T001вЂ“T005)
2. Complete Phase 2: US1 вЂ” attribute catalog import (T006вЂ“T011)
3. Complete Phase 3: US2 вЂ” products with attributes (T012вЂ“T015)
4. **STOP and VALIDATE**: Check `product_attributes` table, check `products.attributes` column
5. Optionally ship вЂ” RAG improvement from Phase 4/5 can follow

### Incremental Delivery

1. Phase 1 в†’ DB ready
2. Phase 2 в†’ Attribute catalog importable (US1 live)
3. Phase 3 в†’ Products carry attributes (US2 live)
4. Phase 4 в†’ Searchable text includes attributes, vector/keyword search improved (US3 live)
5. Phase 5 в†’ Hybrid retriever scores attribute matches (US4 live)
6. Phase 6 в†’ Polish

---

## Notes

- All tasks target a single file to enable precise, unambiguous execution
- T005 requires running Postgres (Docker); skip in unit-test-only runs
- [P] tasks may be dispatched as parallel subagents via `/speckit-implement`
- Existing `product_import` tests should still pass after T013/T014; check for snapshot/mock data alignment
