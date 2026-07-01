# Data Model: Admin Panel

**Date**: 2026-07-01 | **Feature**: 002-adminjs-admin-panel

No new tables. Admin panel reads/writes existing schema tables via AdminJS resources.

---

## Resources Exposed

### products (read + limited edit)

| Column | Type | Admin Access | Notes |
|---|---|---|---|
| `id` | uuid | read-only | PK |
| `rn` | uuid | read-only | Retail network |
| `external_product_id` | uuid | read-only | External system ID |
| `name` | text | editable | Product name |
| `category_id` | text | read-only | |
| `category_name` | text | read-only | |
| `description` | text | editable | |
| `ingredients` | jsonb `string[]` | editable | JSON editor |
| `allergens` | jsonb `string[]` | editable | JSON editor |
| `tags` | jsonb `string[]` | editable | JSON editor |
| `weight` | numeric | read-only | |
| `pieces` | integer | read-only | |
| `calories` | numeric | read-only | |
| `protein` | numeric | read-only | |
| `fat` | numeric | read-only | |
| `carbs` | numeric | read-only | |
| `image_url` | text | read-only | |
| `raw_payload` | jsonb | hidden | Internal |
| `created_at` | timestamp | read-only | |
| `updated_at` | timestamp | read-only | |

**Filters**: `rn`, `category_name`
**List columns**: `name`, `category_name`, `rn`, `updated_at`

---

### city_products (read + flag edit)

| Column | Type | Admin Access | Notes |
|---|---|---|---|
| `id` | uuid | read-only | PK |
| `rn` | uuid | read-only | |
| `br` | uuid | read-only | City GUID |
| `target` | text | read-only | WEB/APP |
| `product_id` | uuid | read-only | FK → products |
| `price` | numeric | read-only | Updated by import only |
| `old_price` | numeric | read-only | |
| `currency` | text | read-only | |
| `is_available` | boolean | **editable** | Manual override |
| `is_valid` | boolean | **editable** | Manual override |
| `invalid_reason` | text | editable | |
| `imported_at` | timestamp | read-only | |
| `raw_payload` | jsonb | hidden | Internal |

**Filters**: `rn`, `br`, `target`, `is_available`, `is_valid`
**List columns**: `br`, `target`, `price`, `is_available`, `is_valid`, `imported_at`
**Linked to**: products.name via `product_id` (shown as display field)

---

### assistant_suggestions (full CRUD)

| Column | Type | Admin Access | Notes |
|---|---|---|---|
| `id` | uuid | read-only | PK |
| `rn` | uuid | read-only | |
| `code` | text | editable | Unique code |
| `title` | text | editable | Display text |
| `emoji` | text | editable | |
| `enabled` | boolean | **editable** | Toggle on/off |
| `sort_order` | integer | editable | |
| `screen_context` | text | editable | |
| `target` | text | editable | |
| `active_from` | timestamp | editable | |
| `active_to` | timestamp | editable | |
| `allowed_br` | jsonb `string[]` | editable | JSON editor |
| `payload` | jsonb `SuggestionPayload` | editable | JSON editor |
| `availability_rules` | jsonb `AvailabilityRules` | editable | JSON editor |
| `fallback_payload` | jsonb `FallbackPayload` | editable | JSON editor |
| `created_at` | timestamp | read-only | |
| `updated_at` | timestamp | read-only | |

**Filters**: `rn`, `enabled`, `target`
**List columns**: `code`, `title`, `enabled`, `sort_order`, `target`, `updated_at`

---

### admin_rules (full CRUD)

| Column | Type | Admin Access | Notes |
|---|---|---|---|
| `id` | uuid | read-only | PK |
| `rn` | uuid | editable | |
| `br` | uuid | editable | null = global |
| `target` | text | editable | |
| `tone` | text | editable | Tone instructions |
| `max_cards_in_response` | integer | editable | |
| `max_suggestions_on_screen` | integer | editable | |
| `banned_phrases` | jsonb `string[]` | editable | JSON editor |
| `fallback_templates` | jsonb | editable | JSON editor |
| `updated_at` | timestamp | read-only | |

**Filters**: `rn`, `br`, `target`
**List columns**: `rn`, `br`, `target`, `max_cards_in_response`, `updated_at`

---

### import_jobs (read-only + custom actions)

| Column | Type | Admin Access | Notes |
|---|---|---|---|
| `id` | uuid | read-only | PK |
| `job_type` | text | read-only | `cities` / `products` |
| `rn` | uuid | read-only | |
| `br` | uuid | read-only | null for cities |
| `target` | text | read-only | |
| `status` | text | read-only | `running`/`success`/`failed`/`partial_failed` |
| `started_at` | timestamp | read-only | |
| `finished_at` | timestamp | read-only | |
| `stats` | jsonb | read-only | JSON viewer |
| `error` | text | read-only | |

**Filters**: `job_type`, `status`, `rn`
**List columns**: `job_type`, `rn`, `br`, `status`, `started_at`, `finished_at`
**Custom actions**:
- `Trigger City Import` — bulk action, no record selection
- `Trigger Product Import` — bulk action, requires `rn`, `br`, `target` params

---

### cities (read-only)

| Column | Type | Admin Access |
|---|---|---|
| `id` | uuid | read-only |
| `rn` | uuid | read-only |
| `br` | uuid | read-only |
| `name` | text | read-only |
| `is_active` | boolean | read-only |

**List columns**: `name`, `br`, `rn`, `is_active`

---

## New Env Vars

| Var | Required | Description |
|---|---|---|
| `ADMIN_USER` | Yes | Admin login email |
| `ADMIN_PASSWORD` | Yes | Admin password |
| `ADMIN_COOKIE_SECRET` | Yes | Fastify session cookie secret (≥32 chars) |

These must be added to `configuration.ts` Zod schema with validation (required when `NODE_ENV !== 'test'`).
