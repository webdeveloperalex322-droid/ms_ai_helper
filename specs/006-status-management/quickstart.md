# Quickstart Validation: Status Management

**Feature**: 006-status-management
**Date**: 2026-07-04

---

## Prerequisites

```bash
docker-compose up -d       # Postgres running
pnpm db:migrate            # migrations applied (includes products.isActive)
pnpm db:seed               # seed data loaded
pnpm start:dev             # dev server at http://localhost:3000/v1
                           # Admin: http://localhost:3000/admin
```

---

## Scenario 1: Disable a City → API returns empty

1. Open admin → Cities list
2. Locate any city (note its `br` UUID)
3. Click Edit → toggle `isActive` to `false` → Save
4. Call API:
   ```bash
   curl -X POST http://localhost:3000/v1/assistant/product-answer \
     -H "Content-Type: application/json" \
     -d '{"rn":"<rn>","br":"<br>","target":"WEB","user_message":"суши"}'
   ```
5. **Expected**: `{ "cards": [], "answer": "" }` — not a FallbackService message
6. Re-enable city → call API again → products return normally

---

## Scenario 2: Disable a Product → excluded from all cities

1. Open admin → Products list
2. Locate any product (note its name)
3. Click Edit → toggle `isActive` to `false` → Save
4. Call product-answer API for any city that previously returned this product
5. **Expected**: product does NOT appear in `cards[]`
6. Re-enable product → product reappears

---

## Scenario 3: Import skips disabled city (already working, regression check)

1. Disable a city via admin (from Scenario 1)
2. Trigger import:
   ```bash
   # via admin panel: Import Jobs → trigger full import
   # or via API if trigger endpoint exists
   ```
3. **Expected**: import logs show city skipped; no new city_products rows for that `br`

---

## Scenario 4: Filter by status in admin

1. Open admin → Cities list → apply filter `isActive = false`
2. **Expected**: only disabled cities shown
3. Open admin → Products list → apply filter `isActive = false`
4. **Expected**: only disabled products shown

---

## Regression Check

Run full test suite after implementation:

```bash
pnpm test
```

All existing tests must pass. Pay attention to:
- `src/modules/rag/tests/` — vector/keyword search tests (now include isActive filters)
- `src/modules/catalog-import/tests/product-import.spec.ts` — import tests
- Any tests that call `CatalogService.findByCity()`

---

## References

- Data model: [data-model.md](data-model.md)
- Admin contracts: [contracts/status-management.md](contracts/status-management.md)
- Spec: [spec.md](spec.md)
