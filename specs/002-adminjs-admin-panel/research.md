# Research: Admin Panel (AdminJS + Drizzle)

**Date**: 2026-07-01 | **Feature**: 002-adminjs-admin-panel

---

## Decision 1: AdminJS with Fastify v5

**Decision**: Use `@adminjs/fastify` v5+ (supports Fastify v5) together with `@adminjs/nestjs`.

**Rationale**: The project runs `@nestjs/platform-fastify` + `fastify ^5.1.0`. AdminJS has a dedicated Fastify adapter. `@adminjs/nestjs` wraps either the Fastify or Express adapter transparently. The NestJS integration registers AdminJS as a Fastify plugin on the underlying Fastify instance, which is accessible via `app.getHttpAdapter().getInstance()`.

**Alternatives considered**:
- Hybrid adapter (Fastify + Express simultaneously): adds complexity, not needed for admin-only routes.
- Separate standalone Express server for admin: unnecessary operational overhead for an internal panel.

**Packages required**:
```
adminjs
@adminjs/nestjs
@adminjs/fastify
@adminjs/drizzle
```

---

## Decision 2: Drizzle ORM Integration

**Decision**: Pass the existing `DrizzleDB` connection (injected via `DATABASE_TOKEN`) into `@adminjs/drizzle`'s `getModelByName` helper. Create a Drizzle adapter instance via `Database.init(db)` from `@adminjs/drizzle`.

**Rationale**: `@adminjs/drizzle` accepts a `db` instance (the same `drizzle(pool)` object already registered in `DatabaseModule`) and a list of schema tables. No separate DB connection needed — reuses the existing pool.

**Drizzle schema tables exposed to AdminJS**:
- `products` — read + limited edit (name, description, tags, allergens)
- `cityProducts` — read + edit `isAvailable`, `isValid`
- `assistantSuggestions` — full CRUD
- `adminRules` — full CRUD
- `importJobs` — read-only + custom trigger action
- `cities` — read-only
- `retailNetworks` — read-only

**Tables hidden from panel** (technical/internal):
- `productChunks`, `productEmbeddings`, `aiLogs`, `assistantSessions`, `suggestionEvents`

---

## Decision 3: Authentication

**Decision**: AdminJS built-in `authenticate` callback with `ADMIN_USER` + `ADMIN_PASSWORD` env vars. Session stored via `@fastify/session` (or `@fastify/cookie` + `@fastify/session`).

**Rationale**: No user DB needed for MVP. AdminJS `authenticate` receives `{email, password}` and returns the user object if valid, `null` otherwise. Session management via Fastify session plugin is the standard approach with `@adminjs/fastify`.

**Env vars**:
- `ADMIN_USER` — admin login (email format)
- `ADMIN_PASSWORD` — admin password

**Security note**: HTTPS-only in production. Credentials via env, never hardcoded.

---

## Decision 4: Custom Action for Import Trigger

**Decision**: AdminJS Custom Action on the `importJobs` resource, type `record` action with `handler` that calls the existing `ImportJobService.startImport()` method via NestJS DI.

**Rationale**: AdminJS Custom Actions can be mounted per-resource and call arbitrary async handlers. Since `AdminModule` is a NestJS module, it can inject `ImportJobService` and pass the reference to the action handler at registration time.

**Action types**:
- "Trigger City Import" — bulk action (no record selection needed), calls `ImportJobService.triggerCityImport(rn)`
- "Trigger Product Import" — bulk action, calls `ImportJobService.triggerProductImport(rn, br, target)`

---

## Decision 5: JSON Field Editing

**Decision**: Use AdminJS `jsonEditor: true` property on JSON fields (`payload`, `bannedPhrases`, `availabilityRules`, `fallbackPayload`, `ingredients`, `allergens`, `tags`). This renders a Monaco-based JSON editor in the admin UI.

**Rationale**: `@adminjs/drizzle` auto-detects `jsonb` column type and AdminJS supports `jsonEditor` component for structured JSON editing — no custom component needed for MVP.

---

## Decision 6: Field Labels (Russian)

**Decision**: Override property labels in each resource config using AdminJS `properties` with `label` field set to Russian strings.

**Example**:
```ts
properties: {
  isAvailable: { label: 'Доступен' },
  bannedPhrases: { label: 'Запрещённые фразы', type: 'mixed', isArray: true },
}
```

**Rationale**: AdminJS supports per-property label overrides. No i18n library needed — static label map per resource is sufficient for a single-locale internal tool.

---

## Decision 7: Module Location

**Decision**: New module at `src/modules/admin/`, registered in `AppModule`. Does NOT conflict with existing `admin-config` module (which is the `AdminRule` CRUD service for the assistant pipeline, not the web panel).

**AdminModule structure**:
```
src/modules/admin/
├── admin.module.ts          # NestJS module, registers AdminJS
├── resources/
│   ├── products.resource.ts
│   ├── city-products.resource.ts
│   ├── suggestions.resource.ts
│   ├── admin-rules.resource.ts
│   └── import-jobs.resource.ts
└── actions/
    └── trigger-import.action.ts
```
