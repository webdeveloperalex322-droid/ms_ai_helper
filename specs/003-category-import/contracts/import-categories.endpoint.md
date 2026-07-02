# Contract: POST /v1/import/categories

Triggers a category import. Mirrors the shape of `POST /v1/import/cities`.

## Request body (`ImportCategoriesDto`)

```jsonc
{
  "rn": "A79C5050-1EE7-11EB-9B6E-05B5FC40DF2A", // required, retail network UUID
  "target": "WEB",                              // optional, default "WEB"
  "slug": "tyumen"                              // optional; if omitted -> all active cities
}
```

- `rn` — required, non-empty string.
- `target` — optional, defaults to `WEB`.
- `slug` — optional city slug; when present, only that city is imported.

## Response

```jsonc
{
  "job_id": "b2b1...uuid",
  "status": "completed",
  "stats": { "imported": 42, "errors": 0, "cities": 6 }
}
```

- Always HTTP 200/201 on a processed request — per-city failures are counted in `stats.errors`, never thrown.
- `status`: `completed` (or `dry-run` if a dry-run mode is later added).

## Behavior

1. Create an `import_jobs` row (`jobType: 'category_import'`, `status: 'running'`).
2. Resolve target cities: single (`slug`) or all active cities with a non-null slug for `rn`.
3. For each city: `getCategories(rn, slug, target)` with retry; upsert categories on `(rn, br, target, categoryId)`; soft-retire unseen (skip when fetch empty).
4. Mark job `success` with `stats`, or `failed` on unrecoverable error.
5. Cancellation: if the job row is deleted mid-run, stop and reflect cancellation.
