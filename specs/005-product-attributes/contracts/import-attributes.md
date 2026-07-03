# Contract: POST /v1/import/attributes

## Request

```
POST /v1/import/attributes
Content-Type: application/json
```

```json
{
  "rn": "A79C5050-1EE7-11EB-9B6E-05B5FC40DF2A"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `rn`  | string (UUID) | Yes | Retail network identifier |

## Response — 202 Accepted

```json
{
  "job_id": "uuid",
  "status": "completed",
  "stats": {
    "imported": 42
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `job_id` | string (UUID) | Import job ID for tracking |
| `status` | `"completed"` \| `"failed"` | Final job status |
| `stats.imported` | number | Count of attribute records upserted |

## Error Cases

| Scenario | HTTP Status | Response |
|----------|-------------|----------|
| Catalog API unavailable | 202 (job created as failed) | `{ "job_id": "...", "status": "failed" }` |
| Missing `rn` | 400 | Validation error from global `ValidationPipe` |

## Validation

- Follows same pattern as `POST /v1/import/categories`
- `rn` validated as `@IsString()` (UUID format not enforced at DTO level, matches existing pattern)

## Swagger

```typescript
@ApiOperation({ summary: 'Import attribute catalog for a retail network' })
```
