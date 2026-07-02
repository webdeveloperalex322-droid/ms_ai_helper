# Quickstart: Category Import validation

Proves the feature end-to-end in real mode. See [data-model.md](data-model.md) and
[contracts/](contracts/) for shapes.

## Prerequisites

- Postgres running (docker-compose or local per memory), pgvector enabled.
- `.env` with `CATALOG_API_MODE=real`, `CITIES_API_BASE_URL=https://venus-api-backend2.apps-web.net`, `CATALOG_API_BASE_URL=https://venus-api-catalog2.apps-web.net`.

## Setup

```bash
pnpm install
pnpm db:generate         # after adding categories.ts + cities.slug
pnpm db:migrate          # apply new migration
pnpm start:dev           # http://localhost:3000/v1
```

## Validation scenarios

1. **City slug captured**
   ```bash
   curl -X POST localhost:3000/v1/import/cities -H 'content-type: application/json' \
     -d '{"rn":"A79C5050-1EE7-11EB-9B6E-05B5FC40DF2A"}'
   ```
   Expect: cities stored; each row's `slug` populated (e.g. `tyumen`).

2. **Categories imported (all cities)**
   ```bash
   curl -X POST localhost:3000/v1/import/categories -H 'content-type: application/json' \
     -d '{"rn":"A79C5050-1EE7-11EB-9B6E-05B5FC40DF2A","target":"WEB"}'
   ```
   Expect: `{ job_id, status:"completed", stats:{ imported>0, errors, cities>0 } }`.
   Verify `categories` rows contain slugs `rolly`, `nabory`, `vok`, ... and `main`/`new`
   flagged `isDefault=true`.

3. **Products now import (was empty before)**
   ```bash
   curl -X POST localhost:3000/v1/import/products -H 'content-type: application/json' \
     -d '{"rn":"A79C5050-1EE7-11EB-9B6E-05B5FC40DF2A","br":"E3AFD1AC-4D3D-EA11-A958-8B023DE8EF69","target":"WEB"}'
   ```
   Expect: products imported for Tyumen using stored non-default slugs.

4. **Raw source sanity (already verified)**
   ```bash
   curl "https://venus-api-catalog2.apps-web.net/v1/products?rn=A79C5050-1EE7-11EB-9B6E-05B5FC40DF2A&br=E3AFD1AC-4D3D-EA11-A958-8B023DE8EF69&target=WEB&category=rolly&withArchive=false"
   ```
   Expect: non-empty product array (proves `category=`+slug is correct).

## Automated tests

```bash
pnpm vitest run src/modules/catalog-import
pnpm test
```

Expect: category-import spec green, mock-client `getCategories` covered, product URL
regression test asserts `&category=`, product-import slug-selection/fallback covered.
