---
description: "Task list for Fix Product Import Field Mapping"
---

# Tasks: Fix Product Import Field Mapping

**Input**: Design documents from `specs/004-fix-import-field-mapping/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/normalizer-mapping.contract.md

**Tests**: INCLUDED — spec FR-010 / User Story 3 explicitly require a regression test from a real payload.

**Organization**: Grouped by user story (US1 P1, US2 P2, US3 P2) plus a cross-cutting mojibake phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different file, no dep on incomplete task)
- Same file (e.g. `product-normalizer.service.ts`) edits are sequential — NOT [P].

## Path Conventions

Backend NestJS module: `src/modules/catalog-import/`. Tests: `src/modules/catalog-import/tests/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Fixture that drives all regression assertions.

- [x] T001 [P] Create real-payload fixture `src/modules/catalog-import/tests/fixtures/real-product.sample.json` from the provided API sample (product `61383050-F152-11F0-8679-B1F02C7CC614`, "Ролл Чесночный драйв запеченный") — with **correctly UTF-8 decoded** Cyrillic (not the mojibake `.txt`), preserving `additionalProperties.nutritional`, `localization[]`, `classifiers[]`, `mainCategotyId`, `productDescription`, `price`, `oldPrice`, `imageUrl`, `productId`, `id`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Type + shared helper that US1/US2 both depend on. MUST complete before Phase 3.

- [x] T002 Redefine `ProductApiResponse` in `src/modules/catalog-import/clients/catalog-api.client.interface.ts` to the real nested shape per [data-model.md](data-model.md): add `productId`, `mainCategotyId`, `productDescription`, `localization[]`, `classifiers[]` (with nested `localization[]`), `additionalProperties.{pieces, nutritional.{calorie,proteins,fat,carbohydrates,weight,composition.{value,localization}}}`; keep `[key: string]: any`; remove the obsolete flat fields (`calories`,`protein`,`fat`,`carbs`,`weight`,`pieces`,`ingredients`,`allergens`,`tags`,`description`,`categoryName`).
- [x] T003 Add private pure helper `pickRu(arr)` (returns `arr.find(x=>x.language==='ru') ?? arr?.[0]`, undefined-safe) in `src/modules/catalog-import/services/product-normalizer.service.ts` — used by US1 description + US2 name/categoryName.

**Checkpoint**: Type compiles; interface reflects real shape. Mock + normalizer will not compile until Phase 3/4 update them — that is expected within this branch.

---

## Phase 3: User Story 1 — Nutrition, description, ingredients (Priority: P1) 🎯 MVP

**Goal**: КЖБУ + description + ingredients persist from nested paths.
**Independent Test**: `pnpm vitest run src/modules/catalog-import/tests/product-normalizer.spec.ts` — nutrition (260/5.9/10.4/35.8), weight "250", description non-empty, ingredients = 9-item array.

- [x] T004 [US1] In `product-normalizer.service.ts` map nutrition: `calories←additionalProperties.nutritional.calorie`, `protein←.proteins`, `fat←.fat`, `carbs←.carbohydrates`, `weight←.weight` (number→String, null when absent; undefined-safe on missing `additionalProperties`/`nutritional`).
- [x] T005 [US1] In `product-normalizer.service.ts` map `description ← productDescription ?? pickRu(localization).productDescription`, trimmed, null if empty.
- [x] T006 [US1] In `product-normalizer.service.ts` add private `parseIngredients(value)` splitting `additionalProperties.nutritional.composition.value` on `,`, trim, drop empties → `string[]`; null if absent/empty. Assign to `product.ingredients`.
- [x] T007 [US1] Ensure `product.rawPayload = raw` still stores the FULL nested object (verify unchanged).
- [x] T008 [P] [US1] Update `MOCK_PRODUCTS` in `catalog-api-mock.client.ts` so at least one product carries nested `additionalProperties.nutritional` (calorie/proteins/fat/carbohydrates/weight/composition.value) and `productDescription`.
- [x] T009 [US1] Update `src/modules/catalog-import/tests/product-normalizer.spec.ts` to load the fixture (T001) and assert nutrition, weight, description, ingredients per [contracts/normalizer-mapping.contract.md](contracts/normalizer-mapping.contract.md).

**Checkpoint**: US1 test green — MVP delivers the core defect fix.

---

## Phase 4: User Story 2 — categoryName, localized name, pieces (Priority: P2)

**Goal**: categoryName + Russian name + pieces persist.
**Independent Test**: normalizer test asserts `categoryName` "Роллы и суши", `name` from `localization[ru]`, `pieces` from nested.

- [x] T010 [US2] In `product-normalizer.service.ts` map `name ← pickRu(localization).name ?? raw.name` (trim).
- [x] T011 [US2] In `product-normalizer.service.ts` add private `resolveCategoryName(raw)`: find `classifiers[]` where `categoryId === mainCategotyId`, else `classifiers[0]`; return `pickRu(cls.localization).name ?? cls.name`; null if classifiers empty/absent. Assign to `product.categoryName`.
- [x] T012 [US2] In `product-normalizer.service.ts` map `pieces ← additionalProperties.pieces` (undefined-safe).
- [x] T013 [P] [US2] Extend `MOCK_PRODUCTS` in `catalog-api-mock.client.ts` with `localization[]`, `classifiers[]` (incl. nested `localization`), `mainCategotyId`, `additionalProperties.pieces`.
- [x] T014 [US2] Extend `product-normalizer.spec.ts` asserting categoryName (match + `classifiers[0]` fallback + null-when-empty), localized name, pieces.

**Checkpoint**: US2 test green.

---

## Phase 5: User Story 3 — Regression protection (Priority: P2)

**Goal**: Fixture-driven full-contract test guards against shape drift; mock/interface consistency test.
**Independent Test**: Reverting any single nested path fails the suite (SC-003).

- [x] T015 [US3] Add a full-contract test block in `product-normalizer.spec.ts` asserting EVERY row of [contracts/normalizer-mapping.contract.md](contracts/normalizer-mapping.contract.md) against the fixture, incl. `rawPayload` deep-equals input and `externalProductId` = plain `productId`.
- [x] T016 [US3] Add robustness cases (FR-008) to `product-normalizer.spec.ts`: missing `additionalProperties` → nutrition/weight/pieces null, no throw, `isValid` by name+price only; empty `composition.value` → ingredients null; no-`ru` localization → uses `[0]`; no classifier match → `classifiers[0]`.
- [x] T017 [P] [US3] Update `src/modules/catalog-import/tests/mock-client.spec.ts` for the nested `MOCK_PRODUCTS` shape (fix any assertions referencing removed flat fields).

**Checkpoint**: Story suite green; regression guard proven by a scratch revert.

---

## Phase 6: Cross-Cutting — Mojibake fix (FR-011) & Polish

**Purpose**: UTF-8 hardening + full-suite green + lint.

- [x] T018 In `catalog-api-http.client.ts` set `responseType: 'json'` and `responseEncoding: 'utf8'` explicitly on the product/category GET & POST calls (per research R4) so decode does not depend on server charset headers. Do NOT add a cp1251→utf8 repair transform.
- [x] T019 [P] In `src/modules/catalog-import/tests/http-client.spec.ts` add a case asserting a UTF-8 JSON body with Cyrillic (`Ролл`) round-trips with no mojibake (`Ð` absent).
- [x] T020 Run `pnpm lint` and `pnpm test`; fix any fallout in touched files. Confirm [quickstart.md](quickstart.md) steps 1–2 & 4 pass.

---

## Dependencies & Execution Order

- **Setup (T001)** → independent, do first.
- **Foundational (T002–T003)** → blocks Phase 3+. T002 before T003.
- **US1 (T004–T009)** → depends on Foundational. T004→T005→T006→T007 sequential (same file). T008 [P]. T009 after T004–T007.
- **US2 (T010–T014)** → depends on Foundational; independent of US1 logically but shares `product-normalizer.service.ts` → sequence T010→T011→T012 after US1 file edits land. T013 [P]. T014 after.
- **US3 (T015–T017)** → after US1+US2 mapping complete. T017 [P].
- **Phase 6 (T018–T020)** → T018/T019 independent of normalizer (http client) — can run any time after Setup. T020 last.

## Parallel Opportunities

- T008, T013 (mock edits) and T018/T019 (http client) are [P] vs normalizer work — different files.
- Within normalizer (`product-normalizer.service.ts`): NOT parallel (single file).

## Implementation Strategy

- **MVP = Phase 1 + 2 + US1 (T001–T009)** — resolves the reported core defect (КЖБУ, description, ingredients).
- Increment US2 → US3 → mojibake.
- Note: on this branch the mock + normalizer temporarily won't compile between T002 and the Phase 3/4 rewrites; land Foundational + US1 together before running the suite.
