# Implementation Plan: Fix Product Import Field Mapping

**Branch**: `004-fix-import-field-mapping` | **Date**: 2026-07-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-fix-import-field-mapping/spec.md`

## Summary

The importer's `ProductNormalizerService` reads flat fields (`raw.calories`, `raw.description`, `raw.weight`, …) that the real venus catalog API never sends. The real API nests nutrition under `additionalProperties.nutritional`, description under `productDescription`/`localization[]`, ingredients under `additionalProperties.nutritional.composition.value`, and category name under `classifiers[]`. Result: КЖБУ, description, ingredients, pieces, weight, categoryName all persist null.

**Technical approach**: Redefine `ProductApiResponse` to the real **nested** shape, rewrite the mock client to emit that shape, and rewrite `ProductNormalizerService.normalize()` to read nested paths (with an internal pure extraction helper for readability). `rawPayload` continues to store the **full nested** object (audit/future retrieval preserved). Add a regression test driven by a fixture derived from the provided real payload sample. Investigate + defensively fix the suspected UTF-8 mojibake at the axios boundary.

## Technical Context

**Language/Version**: TypeScript 5, Node ≥ 22
**Primary Dependencies**: NestJS 10, `@nestjs/axios` (HttpModule/axios), Drizzle ORM, Vitest
**Storage**: PostgreSQL 15 + pgvector (schema unchanged — all target columns already exist)
**Testing**: Vitest (`*.spec.ts` unit + integration)
**Target Platform**: Linux server (backend service)
**Project Type**: Web-service backend (NestJS modular monolith)
**Performance Goals**: N/A — import is batch/offline; no latency change
**Constraints**: No DB migration; no breaking change to `NormalizedProduct` output shape consumed by `ProductImportService`
**Scale/Scope**: 4 source files + 1 fixture + tests. Module: `src/modules/catalog-import/`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is an unpopulated template — no ratified principles or gates defined. No constitutional constraints to evaluate. **PASS** (vacuously). Standard project conventions apply (Zod config, Drizzle schema, path alias `@/`, class-validator DTOs) — none affected by this change.

**Post-Phase-1 re-check**: Still PASS. Design adds no new module, no new dependency, no migration; edits localized to the adapter (clients) + normalizer.

## Project Structure

### Documentation (this feature)

```text
specs/004-fix-import-field-mapping/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── normalizer-mapping.contract.md   # field mapping contract
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/modules/catalog-import/
├── clients/
│   ├── catalog-api.client.interface.ts   # EDIT: ProductApiResponse → real nested shape
│   ├── catalog-api-mock.client.ts        # EDIT: MOCK_PRODUCTS → nested shape
│   └── catalog-api-http.client.ts        # EDIT: mojibake-safe decode (responseEncoding utf8 / explicit json)
├── services/
│   ├── product-normalizer.service.ts     # EDIT: read nested paths + extraction helper
│   └── product-import.service.ts         # UNCHANGED (consumes NormalizedProduct)
└── tests/ (or *.spec.ts colocated)
    ├── product-normalizer.service.spec.ts   # EDIT/ADD: real-payload fixture assertions
    └── fixtures/
        └── real-product.sample.json         # NEW: fixture from provided API sample
```

**Structure Decision**: Single NestJS module (`catalog-import`). No new modules; edits localized to clients + normalizer. `NormalizedProduct` output contract and `products`/`city_products` schema stay fixed, so `ProductImportService` and downstream consumers need no change.

## Complexity Tracking

No constitution violations. Section not applicable.
