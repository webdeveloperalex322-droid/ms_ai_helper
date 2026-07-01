# Quickstart: Admin Panel Validation

**Date**: 2026-07-01

---

## Prerequisites

1. Docker Compose running: `docker-compose up -d`
2. DB migrated: `pnpm db:migrate`
3. DB seeded: `pnpm db:seed`
4. `.env` contains:
   ```
   ADMIN_USER=admin@example.com
   ADMIN_PASSWORD=changeme123
   ADMIN_COOKIE_SECRET=a-secret-at-least-32-characters-long
   ```

---

## Start Dev Server

```bash
pnpm start:dev
```

Server at `http://localhost:3000`.

---

## Scenario 1: Login & Access

1. Open `http://localhost:3000/admin`
2. Redirects to login page
3. Enter `ADMIN_USER` / `ADMIN_PASSWORD`
4. **Expected**: redirected to admin dashboard, all resource sections visible in sidebar

**Negative test**:
- Enter wrong password → login page re-renders with error message, no session created
- Hit `/admin/resources/products` without session → redirect to `/admin/login`

---

## Scenario 2: Product Catalog

1. Click **Products** in sidebar
2. **Expected**: table with columns `name`, `category_name`, `rn`, `updated_at` + pagination
3. Apply filter `rn = <valid-rn>` → list narrows to that network's products
4. Click a product row → detail page
5. Edit `description` field → Save
6. **Expected**: success notice, `updated_at` timestamp changed in DB

```sql
-- Verify:
SELECT description, updated_at FROM products WHERE id = '<edited-id>';
```

---

## Scenario 3: City Products — Toggle Availability

1. Click **City Products** → filter by `br = <valid-br>` and `is_available = true`
2. Click a record → edit page
3. Set `is_available = false` → Save
4. **Expected**: success notice
5. Call `POST /v1/assistant/product-answer` with that `br` and a query matching that product
6. **Expected**: product does NOT appear in response cards

---

## Scenario 4: Admin Rules — Banned Phrases

1. Click **Admin Rules** → open existing rule for `rn`
2. Add `"ТЕСТ_ЗАПРЕЩЁННАЯ_ФРАЗА"` to `banned_phrases` JSON array → Save
3. Call `POST /v1/assistant/product-answer` with any query
4. **Expected**: response `reply_text` does NOT contain `"ТЕСТ_ЗАПРЕЩЁННАЯ_ФРАЗА"`

---

## Scenario 5: Suggestions — Toggle

1. Click **Assistant Suggestions** → find a suggestion with `enabled = true`
2. Set `enabled = false` → Save
3. Call `GET /v1/assistant/suggestions?rn=...&br=...&target=WEB`
4. **Expected**: toggled suggestion does NOT appear in response

---

## Scenario 6: Import Trigger

1. Click **Import Jobs** → see history list
2. Click **Trigger City Import** action button
3. Fill `rn` in action form → confirm
4. **Expected**: success notice with job ID, new row appears in list with `status = running` → eventually `success`

---

## Scenario 7: Access Control

Verify destructive operations are blocked:

| Action | Expected |
|---|---|
| Try to DELETE a product from admin UI | Delete action not visible |
| Try to CREATE a city_product | Create action not visible |
| Try to EDIT `price` on city_product | Field not editable (read-only) |
| Navigate to `/admin` without session | Redirect to `/admin/login` |
