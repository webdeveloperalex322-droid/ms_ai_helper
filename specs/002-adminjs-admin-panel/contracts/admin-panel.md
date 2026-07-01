# Admin Panel Contracts

**Date**: 2026-07-01

The admin panel is a server-rendered UI — no REST API contract. AdminJS generates all routes internally under `/admin`. This document describes the functional contracts: what routes exist, what auth is required, and what Custom Actions are exposed.

---

## Route Map

| Route | Method | Description |
|---|---|---|
| `/admin` | GET | Dashboard (redirect to login if not authed) |
| `/admin/login` | GET/POST | Login form |
| `/admin/logout` | GET | Destroy session |
| `/admin/resources/products` | GET | Products list |
| `/admin/resources/products/:id` | GET | Product detail/edit |
| `/admin/resources/city_products` | GET | City products list |
| `/admin/resources/city_products/:id` | GET | City product edit |
| `/admin/resources/assistant_suggestions` | GET | Suggestions list |
| `/admin/resources/assistant_suggestions/:id` | GET/POST | Suggestion create/edit |
| `/admin/resources/admin_rules` | GET | Admin rules list |
| `/admin/resources/admin_rules/:id` | GET/POST | Rule create/edit |
| `/admin/resources/import_jobs` | GET | Import jobs list |
| `/admin/api/resources/import_jobs/actions/trigger-city-import` | POST | Custom action |
| `/admin/api/resources/import_jobs/actions/trigger-product-import` | POST | Custom action |
| `/admin/resources/cities` | GET | Cities list (read-only) |

All routes under `/admin` require an authenticated session.

---

## Authentication Contract

**Method**: Session-based (Fastify session cookie)

**Login**:
- POST `/admin/login` with `{ email, password }` form body
- Validates against `ADMIN_USER` + `ADMIN_PASSWORD` env vars
- On success: sets encrypted session cookie, redirects to `/admin`
- On failure: re-renders login with error message

**Session**:
- Cookie name: `adminjs` (default)
- Cookie secret: `ADMIN_COOKIE_SECRET` env var (≥32 chars)
- Session TTL: 8 hours

---

## Custom Action Contracts

### Trigger City Import

```
POST /admin/api/resources/import_jobs/actions/trigger-city-import
Content-Type: application/json
Cookie: [session]

Body: { "rn": "<uuid>" }
```

**Response**:
```json
{
  "notice": {
    "message": "Импорт городов запущен. Job ID: <uuid>",
    "type": "success"
  },
  "redirectUrl": "/admin/resources/import_jobs"
}
```

**Error response**:
```json
{
  "notice": {
    "message": "Ошибка запуска: <error text>",
    "type": "error"
  }
}
```

### Trigger Product Import

```
POST /admin/api/resources/import_jobs/actions/trigger-product-import
Content-Type: application/json
Cookie: [session]

Body: { "rn": "<uuid>", "br": "<uuid>", "target": "WEB" }
```

**Response**: same shape as city import.

---

## Access Control Matrix

| Resource | List | Show | Edit | Create | Delete |
|---|---|---|---|---|---|
| products | ✓ | ✓ | partial* | ✗ | ✗ |
| city_products | ✓ | ✓ | partial* | ✗ | ✗ |
| assistant_suggestions | ✓ | ✓ | ✓ | ✓ | ✓ |
| admin_rules | ✓ | ✓ | ✓ | ✓ | ✓ |
| import_jobs | ✓ | ✓ | ✗ | ✗ | ✗ |
| cities | ✓ | ✓ | ✗ | ✗ | ✗ |

*partial: only specific fields editable (see data-model.md for per-field access)
