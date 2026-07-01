# Implementation Plan: Admin Panel

**Branch**: `002-adminjs-admin-panel` | **Date**: 2026-07-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-adminjs-admin-panel/spec.md`

---

## Summary

Mount AdminJS as a NestJS module on `/admin` using `@adminjs/nestjs` + `@adminjs/fastify` + `@adminjs/drizzle`. Reuse the existing Drizzle DB connection. Expose 5 tables as resources with appropriate access restrictions. Auth via session-based auth from env vars. Custom Actions trigger import jobs. No new DB tables needed.

---

## Technical Context

**Language/Version**: TypeScript 5.7 / Node 22

**Primary Dependencies** (new packages to install):
- `adminjs` — core AdminJS framework
- `@adminjs/nestjs` — NestJS integration module
- `@adminjs/fastify` — Fastify v5 adapter (project uses `@nestjs/platform-fastify`)
- `@adminjs/drizzle` — Drizzle ORM adapter
- `@fastify/session` — session plugin for auth
- `@fastify/cookie` — cookie plugin (session dependency)

**Storage**: PostgreSQL 15 (existing). No new migrations.

**Testing**: Manual validation per `quickstart.md`. No unit tests for auto-generated admin UI.

**Target Platform**: Internal web UI at `/admin`. NestJS 10 + Fastify 5.

**Project Type**: Internal admin web panel mounted as NestJS module.

**Performance Goals**: Internal-only; <3s page load acceptable.

**Constraints**:
- No new DB tables or migrations
- No changes to existing API modules (`assistant`, `catalog`, etc.)
- Admin module must not affect existing `/v1/*` routes
- Env var validation via existing `configuration.ts` Zod schema pattern

**Scale/Scope**: Single admin user (no multi-user, no roles), internal tool.

---

## Constitution Check

No project constitution defined. Checked against project conventions from CLAUDE.md:

- ✓ New module follows `src/modules/<name>/` NestJS modular pattern
- ✓ No DB schema changes → no new migration
- ✓ New env vars added to `configuration.ts` Zod schema
- ✓ Config accessed via `ConfigService` (not `process.env` directly)
- ✓ No new public API endpoints (admin routes are internal, not `v1/`)

No violations.

---

## Project Structure

### Documentation (this feature)

```text
specs/002-adminjs-admin-panel/
├── plan.md              ← this file
├── research.md          ← Phase 0: package/integration decisions
├── data-model.md        ← Phase 1: resource field access matrix
├── quickstart.md        ← Phase 1: manual validation scenarios
├── contracts/
│   └── admin-panel.md   ← Phase 1: route map, auth, custom actions
└── tasks.md             ← Phase 2: /speckit-tasks output (not yet created)
```

### Source Code (repository root)

```text
src/modules/admin/
├── admin.module.ts                    # NestJS DynamicModule, registers AdminJS
├── resources/
│   ├── products.resource.ts           # list/show + partial edit (name, desc, tags)
│   ├── city-products.resource.ts      # list/show + flag-only edit (isAvailable, isValid)
│   ├── suggestions.resource.ts        # full CRUD + JSON field editors
│   ├── admin-rules.resource.ts        # full CRUD + JSON field editors
│   └── import-jobs.resource.ts        # read-only + custom actions
└── actions/
    └── trigger-import.action.ts       # Custom action handler → ImportJobService

src/common/config/
└── configuration.ts                   # +ADMIN_USER, ADMIN_PASSWORD, ADMIN_COOKIE_SECRET

.env                                   # add new vars locally
.env.example                           # document new vars
```

**Structure Decision**: Single NestJS module in `src/modules/admin/`. Resource configs split per table for maintainability. Follows existing `src/modules/` convention.

---

## Implementation Steps

### Step 1 — Install packages

```bash
pnpm add adminjs @adminjs/nestjs @adminjs/fastify @adminjs/drizzle @fastify/session @fastify/cookie
```

Verify `@adminjs/fastify` peer dep supports Fastify v5 (check `peerDependencies` in installed package).

### Step 2 — Add env vars to configuration.ts

Extend Zod schema with:
```ts
ADMIN_USER: z.string().email(),
ADMIN_PASSWORD: z.string().min(8),
ADMIN_COOKIE_SECRET: z.string().min(32),
```
Wrap in `.optional()` or provide defaults for `NODE_ENV === 'test'` to avoid test env failures.

### Step 3 — Create resource configs (one file per table)

Each exports `ResourceWithOptions`:
- `resource: { model: getModelByName(tableName, db, schema), client: db }` — `@adminjs/drizzle` API
- `options.actions` — disable `new`/`delete`/`edit` where appropriate
- `options.properties` — set `label`, `isVisible`, `type` per field
- JSON fields: `type: 'mixed'`, `isArray: true` where applicable

**products.resource.ts**: actions `new=false`, `delete=false`; editable: `name`, `description`, `ingredients`, `allergens`, `tags`.

**city-products.resource.ts**: actions `new=false`, `delete=false`; editable: `isAvailable`, `isValid`, `invalidReason`; `price` read-only.

**suggestions.resource.ts**: all actions enabled; JSON fields for `payload`, `availabilityRules`, `allowedBr`, `fallbackPayload`.

**admin-rules.resource.ts**: all actions enabled; JSON fields for `bannedPhrases`, `fallbackTemplates`.

**import-jobs.resource.ts**: all standard actions disabled; two custom bulk actions added.

### Step 4 — Create trigger-import.action.ts

AdminJS `ActionContext` receives the NestJS app context via closure at module init time. The action:
1. Reads `rn` (and optionally `br`, `target`) from action payload
2. Calls `importJobService.startCityImport(rn)` or `startProductImport(rn, br, target)`
3. Returns `{ notice: { message, type }, redirectUrl }` per AdminJS contract

### Step 5 — Create admin.module.ts

```ts
@Module({})
export class AdminModule {
  static register(): DynamicModule {
    return AdminJsModule.createAdminAsync({
      imports: [DatabaseModule, CatalogImportModule],
      inject: [DATABASE_TOKEN, ConfigService, ImportJobService],
      useFactory: async (db, config, importService) => ({
        adminJsOptions: {
          rootPath: '/admin',
          resources: [
            productsResource(db),
            cityProductsResource(db),
            suggestionsResource(db),
            adminRulesResource(db, importService),
            importJobsResource(db, importService),
          ],
        },
        auth: {
          authenticate: async ({ email, password }) =>
            email === config.get('ADMIN_USER') && password === config.get('ADMIN_PASSWORD')
              ? { email }
              : null,
          cookieName: 'adminjs',
          cookiePassword: config.get('ADMIN_COOKIE_SECRET'),
        },
        sessionOptions: {
          resave: true,
          saveUninitialized: true,
          secret: config.get('ADMIN_COOKIE_SECRET'),
        },
      }),
    });
  }
}
```

### Step 6 — Register in AppModule

```ts
imports: [
  ConfigModule,
  DatabaseModule,
  LlmModule,
  AdminModule.register(),    // ← add
  AssistantModule,
  // ... other modules
]
```

### Step 7 — Update .env and .env.example

```
# Admin Panel
ADMIN_USER=admin@example.com
ADMIN_PASSWORD=changeme123
ADMIN_COOKIE_SECRET=replace-with-at-least-32-char-random-secret
```

---

## Risk & Mitigation

| Risk | Mitigation |
|---|---|
| `@adminjs/fastify` peer dep mismatch with Fastify v5 | Check after `pnpm add`; if needed pin `@adminjs/fastify` to v5.x |
| `@adminjs/drizzle` `getModelByName` API changes | Pin to exact version; check docs on install |
| Session cookie not persisting | Register `@fastify/cookie` before `@fastify/session` |
| AdminJS JS bundle conflicts with Swagger UI | AdminJS on `/admin`, Swagger on `/v1/docs` — no conflict |
| Slow list page on large `city_products` table | AdminJS pagination is 10/page by default; existing DB indexes cover `rn/br/target` filters |
| `configuration.ts` validation breaks test env | Use `.optional().default(...)` for admin vars in test mode |
