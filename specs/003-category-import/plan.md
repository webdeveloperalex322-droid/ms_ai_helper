# Implementation Plan: Category Import

**Branch**: `003-category-import` | **Date**: 2026-07-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-category-import/spec.md`

## Summary

Import product categories per city from the Venus `/v1/init` endpoint (keyed by city
slug), persist them in a new `categories` table, and wire the imported category **slugs**
into the product import request. This fixes two live-verified defects that block real-mode
product import: the request uses the wrong query parameter name (`cat=` instead of the
required `category=`) and passes hardcoded category identifiers that the API does not
recognize. City import is extended to capture each city's slug (the key `/v1/init`
requires). Category import runs across all active cities, stores all categories (flagging
virtual/default ones), and product import iterates the real non-default slugs.

## Technical Context

**Language/Version**: TypeScript, Node >= 22

**Primary Dependencies**: NestJS 10 (Fastify), Drizzle ORM, @nestjs/axios (axios), Zod config, PostgreSQL 15 + pgvector

**Storage**: PostgreSQL via Drizzle; new `categories` table, `cities.slug` column added

**Testing**: Vitest (unit/integration `src/**/*.spec.ts`), mock catalog client path

**Target Platform**: Linux/Windows server (NestJS backend under `src/`)

**Project Type**: Web-service (modular monolith), single project

**Performance Goals**: Import throughput bounded by external API; retry with exponential backoff (3 attempts). Not latency-critical (batch/admin import).

**Constraints**: Import endpoints must always return a result (per-city failures recorded, never thrown to caller). Empty source response must not wipe stored categories. No hand-written SQL migrations (drizzle-kit only).

**Scale/Scope**: ~dozens of active cities per retail network, tens of categories per city.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution (`.specify/memory/constitution.md`) is an unpopulated template
with no ratified principles. No specific gates to enforce. Feature follows existing repo
conventions (Zod config, Drizzle schema + generated migrations, mock/real client swap,
import-job tracking, best-effort logging) — no new architectural patterns introduced.
**Result: PASS (no violations).**

## Project Structure

### Documentation (this feature)

```text
specs/003-category-import/
├── plan.md              # This file
├── spec.md              # Feature spec
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (API + client contracts)
│   ├── import-categories.endpoint.md
│   └── catalog-api-client.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
src/
├── database/
│   ├── schema/
│   │   ├── categories.ts          # NEW: categories table
│   │   ├── cities.ts              # EDIT: add slug column
│   │   └── index.ts              # EDIT: re-export categories
│   └── migrations/               # generated via pnpm db:generate
└── modules/
    └── catalog-import/
        ├── clients/
        │   ├── catalog-api.client.interface.ts   # EDIT: CategoryApiResponse + getCategories; CityApiResponse.slug
        │   ├── catalog-api-http.client.ts        # EDIT: getCategories (/v1/init); fix cat=->category=
        │   └── catalog-api-mock.client.ts        # EDIT: getCategories mock
        ├── services/
        │   ├── category-import.service.ts        # NEW: import orchestration
        │   ├── city-import.service.ts            # EDIT: capture slug
        │   └── product-import.service.ts         # EDIT: use stored slugs, skip default
        ├── controllers/
        │   └── import.controller.ts              # EDIT: POST /v1/import/categories
        ├── catalog-import.module.ts              # EDIT: register CategoryImportService
        └── tests/
            ├── category-import.spec.ts           # NEW
            ├── mock-client.spec.ts               # EDIT: getCategories
            └── product-import.spec.ts            # EDIT: slug selection + fallback
```

**Structure Decision**: Single-project NestJS monolith. All work lands inside the existing
`catalog-import` module plus two schema files, mirroring the established `city-import` /
`product-import` structure. No new module.

## Complexity Tracking

No constitution violations. Section intentionally empty.
