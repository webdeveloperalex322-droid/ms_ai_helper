# Contract: ProductNormalizerService.normalize()

Internal contract. Input = one real venus API product (`ProductApiResponse`, nested). Output = `NormalizedProduct` (unchanged shape: `{ product, cityProduct, isValid, invalidReason? }`). Consumed by `ProductImportService.upsertProduct()`.

**Signature (unchanged)**: `normalize(raw: ProductApiResponse, rn: string, br: string, target: string): NormalizedProduct`

## Guarantees

Given the provided real sample (`61383050-F152-11F0-...`, "Ролл Чесночный драйв запеченный"):

| Output field | Expected value |
|---|---|
| `product.name` | `"Ролл Чесночный драйв запеченный"` (from `localization[ru].name`) |
| `product.externalProductId` | `"61383050-F152-11F0-8679-B1F02C7CC614"` (plain `productId`, not `-WEB` id) |
| `product.categoryId` | `"620E38C0-4149-11EC-B578-65989D437D8E"` |
| `product.categoryName` | `"Роллы и суши"` (classifier matching `mainCategotyId` `5E2E45E0-...`) |
| `product.description` | the `productDescription` marketing text (non-empty) |
| `product.ingredients` | `["Крем сыр","курица","огурец","лук фри","чесночный соус","снаги соус","кунжут","рис","нори"]` |
| `product.weight` | `"250"` |
| `product.pieces` | `0` |
| `product.calories` | `"260"` |
| `product.protein` | `"5.9"` |
| `product.fat` | `"10.4"` |
| `product.carbs` | `"35.8"` |
| `product.imageUrl` | the `imageUrl` firebase URL |
| `product.rawPayload` | deep-equals the full nested input object |
| `cityProduct.price` | `"259"` |
| `cityProduct.oldPrice` | `"0"` (source `oldPrice` 0 → present) |
| `isValid` | `true` |

## Robustness guarantees (FR-008)

- Input with `additionalProperties` absent → nutrition + `weight` + `pieces` null; NO throw; `isValid` decided by name+price only.
- Input with `nutritional.composition.value` empty/absent → `ingredients` null (never `[""]`).
- Input with no `ru` localization but a `[0]` entry → uses `[0]`.
- Input with no `localization` at all → `name`/`description` fall back to top-level.
- Input with no classifier matching `mainCategotyId` → `categoryName` from `classifiers[0]`; null only if `classifiers` empty/absent.

## Non-goals

- Does not map `allergens`/`tags` (no source field) → remain null.
- Does not alter `NormalizedProduct` shape, DB schema, or `ProductImportService`.
