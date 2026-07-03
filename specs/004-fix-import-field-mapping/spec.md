# Feature Specification: Fix Product Import Field Mapping

**Feature Branch**: `004-fix-import-field-mapping`

**Created**: 2026-07-02

**Status**: Draft

**Input**: User description: "Fix product import field mapping. Real venus catalog API returns nested product JSON but ProductNormalizerService reads flat fields that don't exist, so КЖБУ (calories/protein/fat/carbs/weight), description, ingredients, pieces, categoryName all persist as null."

## Clarifications

### Session 2026-07-02

- Q: When no `classifiers[]` entry matches `mainCategotyId`, how to resolve categoryName? → A: Fall back to the first classifier (`classifiers[0]`).
- Q: Mojibake/UTF-8 encoding fix on Russian text — ship in this change or defer? → A: Investigate root cause AND fix it within this change.
- Q: Which `localization[]` / `classifiers[]` entry to pick for Russian text? → A: Prefer the entry with `language == "ru"`; fall back to index `[0]` when absent.

## Problem Statement

The product import reads a **flat** shape of the external catalog product that does not match the **nested** shape the real venus API actually returns. As a result, imported products persist with empty nutrition (КЖБУ), description, ingredients, pieces, weight, and category name. Only a handful of top-level fields (name, categoryId, price, oldPrice, imageUrl) survive. The gap went unnoticed because the mock client and the type definition both mirror the wrong flat shape, so tests pass against a fiction.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Complete nutrition and description on imported products (Priority: P1)

An operator imports a catalog from the real venus API. After import, each product carries its nutrition facts (calories, protein, fat, carbs, weight), its marketing description, and its ingredient list — the same data the source API provides — so the AI assistant can answer questions like "how many calories" or "what's in this roll" and render complete product cards.

**Why this priority**: This is the core defect. Without it the assistant answers with missing data and product cards look empty. All value depends on this.

**Independent Test**: Feed a real API product payload (the provided sample) through the importer and assert the persisted product row has non-null calories/protein/fat/carbs/weight/description/ingredients matching the payload's nested values.

**Acceptance Scenarios**:

1. **Given** a real API product with `additionalProperties.nutritional` populated, **When** it is imported, **Then** the persisted product has calories, protein, fat, carbs, and weight equal to `nutritional.calorie`, `nutritional.proteins`, `nutritional.fat`, `nutritional.carbohydrates`, and `nutritional.weight`.
2. **Given** a real API product with `productDescription` text, **When** it is imported, **Then** the persisted `description` equals that text.
3. **Given** a real API product with `additionalProperties.nutritional.composition.value` as a comma-separated ingredient string, **When** it is imported, **Then** `ingredients` is persisted as an array of trimmed ingredient names.

### User Story 2 - Correct category name and identity fields (Priority: P2)

An operator wants each imported product labeled with its human-readable main category and its Russian display name, so products group and display correctly.

**Why this priority**: Improves catalog usability and grouping; depends on P1 mapping work but is a distinct field set.

**Independent Test**: Import the sample payload and assert `categoryName` resolves from the classifier matching `mainCategotyId`, and `name` prefers the localized name.

**Acceptance Scenarios**:

1. **Given** a product whose `mainCategotyId` matches a `classifiers[]` entry, **When** imported, **Then** `categoryName` equals that classifier's localized (ru) name.
2. **Given** a product with a `localization[0].name`, **When** imported, **Then** `name` uses the localized name in preference to the top-level `name`.
3. **Given** a product with `additionalProperties.pieces` set, **When** imported, **Then** `pieces` is persisted from that nested value.

### User Story 3 - Regression protection against shape drift (Priority: P2)

A developer changes the importer later. A test built from a real API payload sample fails if the mapping regresses, so this defect cannot silently return.

**Why this priority**: Prevents recurrence; the original bug existed precisely because no test used a real payload.

**Independent Test**: A committed fixture derived from the real API sample drives a normalizer test asserting every mapped field.

**Acceptance Scenarios**:

1. **Given** a committed real-payload fixture, **When** the normalizer maps it, **Then** all target fields (nutrition, description, ingredients, weight, pieces, categoryName, name) are asserted non-null and correct.
2. **Given** the mock client output, **When** compared to the type definition, **Then** both reflect the real nested shape (not the old flat shape).

### Edge Cases

- Product missing `additionalProperties` or `nutritional` entirely → nutrition/weight/pieces persist as null, import still succeeds, product still valid if name+price present.
- `composition.value` empty string or absent → `ingredients` persists as null (not an empty-string array element).
- No `localization` entry → `name` falls back to top-level `name`; `description` falls back to top-level `productDescription`. When a `localization[]` array exists but has no `ru` entry, index `[0]` is used.
- No classifier matches `mainCategotyId` → `categoryName` falls back to `classifiers[0]`; it is null only when `classifiers[]` is empty/absent.
- Russian text arrives mojibake-encoded (UTF-8 bytes decoded as single-byte). Flagged as a related concern — see Assumptions; correct handling of encoding is investigated but its fix may be a separate change.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Import MUST read calories from `additionalProperties.nutritional.calorie`, protein from `.proteins`, fat from `.fat`, carbs from `.carbohydrates`, and weight from `.weight`, persisting each to the corresponding product field.
- **FR-002**: Import MUST read `pieces` from `additionalProperties.pieces`.
- **FR-003**: Import MUST persist `description` from `productDescription`, falling back to `localization[0].productDescription` when the top-level value is empty.
- **FR-004**: Import MUST derive `ingredients` by splitting `additionalProperties.nutritional.composition.value` on commas, trimming entries, and dropping empties; if the source is absent or empty, `ingredients` is null.
- **FR-005**: Import MUST resolve `categoryName` from the `classifiers[]` entry whose `categoryId` equals `mainCategotyId`, using that entry's localized (ru) name (or its `name`). When no entry matches `mainCategotyId`, import MUST fall back to the first classifier (`classifiers[0]`); `categoryName` is null only when `classifiers[]` is empty/absent.
- **FR-006**: Import MUST prefer the Russian localization for the product `name`: select the `localization[]` entry with `language == "ru"`, else index `[0]`, else the top-level `name`. The same "prefer ru, else index [0]" rule applies to any localized text read from `localization[]` and `classifiers[].localization[]` (name, description, categoryName).
- **FR-007**: Import MUST continue to persist the already-correct fields unchanged: `categoryId`, `price`, `oldPrice`, `imageUrl`, `externalProductId`, and the full `rawPayload`.
- **FR-008**: Import MUST remain resilient to missing nested nodes — absent `additionalProperties`, `nutritional`, `localization`, or `classifiers` MUST NOT throw; affected fields persist as null and the product is still evaluated for validity by existing rules (name present, price > 0).
- **FR-009**: The external product type definition MUST be updated to describe the real nested shape, and the mock catalog client MUST emit payloads matching that nested shape.
- **FR-010**: A regression test MUST assert the full field mapping against a fixture derived from the provided real API payload sample.
- **FR-011**: The suspected UTF-8 mojibake on Russian text MUST be investigated, its root cause documented, AND fixed within this change so persisted Russian text is correctly decoded.

### Key Entities *(include if feature involves data)*

- **Product (persisted)**: name, categoryId, categoryName, description, ingredients[], weight, pieces, calories, protein, fat, carbs, imageUrl, externalProductId, rawPayload.
- **External API Product (source)**: nested object with top-level `name`/`productDescription`/`categoryId`/`mainCategotyId`/`price`/`oldPrice`/`imageUrl`, `additionalProperties.nutritional.{calorie,proteins,fat,carbohydrates,weight,composition.value,pieces}`, `additionalProperties.pieces`, `localization[]`, and `classifiers[]`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After importing the real API sample, 100% of the target fields (calories, protein, fat, carbs, weight, pieces, description, ingredients, categoryName, name) are non-null and equal to the source values.
- **SC-002**: Re-importing a catalog previously imported before this fix increases the count of products with non-null nutrition from ~0% to ~the share of source products that supply nutrition data.
- **SC-003**: The regression test fails if any single target field mapping is reverted.
- **SC-004**: Importing a payload with missing nested nodes completes without error and marks products valid/invalid by the existing name+price rules only.

## Assumptions

- The provided single-product sample is representative of the real venus API product shape for the fields in scope.
- Ingredients source is the comma-separated `composition.value` string; there is no separate structured ingredient array in the API.
- Allergens and tags remain unmapped (no clear source field in the sample); they stay null unless a source is identified later.
- The mojibake in the sample (`Ð Ð¾Ð»Ð»…`) reflects an encoding artifact at fetch/decode time, not the true stored data; investigating AND fixing it is in scope of this change (see FR-011).
- Existing DB schema already has all target columns; no migration is required.
- `categoryName` falls back to `classifiers[0]` when no entry matches `mainCategotyId`; null only when the classifiers array is empty/absent.
- Localized text prefers the `language == "ru"` entry, else index `[0]`.
