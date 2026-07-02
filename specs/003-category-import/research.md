# Phase 0 Research: Category Import

All unknowns were resolved by live probing of the Venus API and reading the existing
codebase. No open NEEDS CLARIFICATION.

## Decision 1: Category source endpoint & response shape

- **Decision**: Fetch categories from `GET {CITIES_API_BASE_URL}/v1/init?rn={rn}&slug={citySlug}&target={target}` (host `venus-api-backend2.apps-web.net`).
- **Rationale**: Live response contains `businessRegion.id` (the `br` to key rows by) and a `categories[]` array with `categoryId`, `slug`, `name`, `parentId`, `orderIndex`, `isDefault`, `classifierId`, `iconUrl`, `imageUrl`, `target`, `localization[]`.
- **Alternatives**: No dedicated `/v1/categories` endpoint exists; `/v1/init` is the source of truth per city.

## Decision 2: Product-request parameter fix (the core defect)

- **Decision**: Product request must use `&category={slug}` (not `&cat={id}`).
- **Rationale**: Live-verified —
  - `...&cat=rolly...` → `{"message":"'category' parameter is required."}`
  - `...&category=rolly...` → product array
  - `...&category=<GUID>...` → `[]` (empty) — so the **slug**, not the category GUID, is the correct value.
- **Alternatives**: Passing category GUID rejected (returns empty). Keeping `cat=` rejected (API error).

## Decision 3: City slug is required and available

- **Decision**: Add `slug` to `cities`; capture it in city import.
- **Rationale**: `/v1/init` is keyed by city slug. Live `GET /v1/cities?rn=` already returns `slug` per city (e.g. `tyumen`, `adler`), currently dropped by the normalizer.
- **Alternatives**: Deriving slug from name rejected (unreliable transliteration; source provides canonical slug).

## Decision 4: Store all categories, flag virtual/default

- **Decision**: Persist every category including virtual aggregates (`main` = "Для вас", `new` = "Хиты и новинки"). Store `isDefault` and `parentId`; product import selects `WHERE NOT isDefault`.
- **Rationale**: User decision — keep full catalog for completeness/admin, but exclude virtual aggregates from product-filter iteration to avoid duplicate/aggregate product sets.
- **Alternatives**: Storing only real categories rejected (loses hierarchy/admin visibility).

## Decision 5: Drive import over all active cities

- **Decision**: `importCategories({ rn, target, slug? })` — with `slug` → single city; without → iterate active `cities` having a non-null slug.
- **Rationale**: User decision. Reuses existing active-city query pattern from product import.
- **Alternatives**: Single-city-only rejected (user wants full coverage). A city lacking a slug is counted as an error, not fatal.

## Decision 6: Reuse existing import infrastructure

- **Decision**: Reuse `ImportJobService` (jobType `category_import`), `fetchWithRetry` pattern (3 attempts, `2^attempt * 500ms`), cancellation via `importJobService.exists(jobId)`, and best-effort error accounting from `city-import.service.ts` / `product-import.service.ts`.
- **Rationale**: Consistency with existing imports; no new patterns.
- **Alternatives**: New job mechanism rejected (duplication).

## Decision 7: Unseen-category handling

- **Decision**: Mark categories absent from the latest fetch as `isActive=false`; skip this marking entirely when the fetch returns zero categories for a city (transient-empty safety), mirroring product import's `markUnseen` guard.
- **Rationale**: Avoid wiping data on a transient empty upstream response.
- **Alternatives**: Hard delete rejected (loses history, breaks FK-style references from products by slug).

## Decision 8: Migration generation

- **Decision**: Add schema files, run `pnpm db:generate` to produce the migration, apply with `pnpm db:migrate`.
- **Rationale**: Repo convention — never hand-write SQL migrations.
