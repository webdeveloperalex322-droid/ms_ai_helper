# Data Model: Fix Product Import Field Mapping

No DB schema change. All target columns already exist. This documents the **source** (external API) shape being introduced and the **persisted** shape (unchanged) for reference.

## Persisted entities (unchanged — no migration)

### products (`src/database/schema/products.ts`)
Target columns filled by this change: `name`, `categoryId`, `categoryName`, `description`, `ingredients` (jsonb string[]), `weight` (numeric), `pieces` (int), `calories`/`protein`/`fat`/`carbs` (numeric), `imageUrl`, `externalProductId`, `rawPayload` (jsonb = full nested source).

### city_products (`src/database/schema/city-products.ts`)
Filled: `price`, `oldPrice`, `currency` ('RUB'), `isAvailable`, `isValid`, `invalidReason`, `rawPayload`. Unchanged by this feature.

## Source entity: real venus API product (new nested type)

`ProductApiResponse` (redefined in `catalog-api.client.interface.ts`):

```
ProductApiResponse {
  id: string                       // "<guid>-WEB" (target-suffixed)
  productId?: string               // plain guid (preferred for externalProductId)
  name: string                     // top-level (mojibake-prone) fallback
  categoryId?: string
  mainCategotyId?: string          // NOTE: source misspelling preserved
  productDescription?: string
  price?: number
  oldPrice?: number
  imageUrl?: string
  isAvailable?: boolean            // absent in sample; keep optional
  localization?: Array<{
    language: string               // "ru"
    name?: string
    shortName?: string
    productDescription?: string
    promotionDetails?: string
  }>
  classifiers?: Array<{
    categoryId: string
    name?: string
    localization?: Array<{ language: string; name?: string }>
    isMain?: boolean
    slug?: string
    target?: string
  }>
  additionalProperties?: {
    pieces?: number
    nutritional?: {
      calorie?: number
      proteins?: number
      fat?: number
      carbohydrates?: number
      weight?: number
      composition?: {
        value?: string             // comma-separated ingredient string
        localization?: Array<{ language: string; name?: string }>
      }
    }
  }
  [key: string]: any               // preserve richness for rawPayload
}
```

## Derivation rules (source → persisted)

| Persisted field | Derivation | Null when |
|---|---|---|
| `name` | `pickRu(localization).name` ?? `name` (trim) | never (validated) |
| `categoryId` | `categoryId` | source absent |
| `categoryName` | classifier matching `mainCategotyId` else `classifiers[0]`; `pickRu(cls.localization).name` ?? `cls.name` | `classifiers` empty/absent |
| `description` | `productDescription` ?? `pickRu(localization).productDescription`; trim | empty/absent |
| `ingredients` | `nutritional.composition.value` split `,` → trim → drop empty | source empty/absent |
| `weight` | `nutritional.weight` → String | absent |
| `pieces` | `additionalProperties.pieces` | absent |
| `calories` | `nutritional.calorie` → String | absent |
| `protein` | `nutritional.proteins` → String | absent |
| `fat` | `nutritional.fat` → String | absent |
| `carbs` | `nutritional.carbohydrates` → String | absent |
| `imageUrl` | `imageUrl` | absent |
| `externalProductId` | `productId` ?? `id` | never |
| `rawPayload` | entire nested object | never |

`pickRu(arr)` = `arr.find(x => x.language === 'ru') ?? arr?.[0]` (guarded against undefined).

## Validity rules (unchanged)

Product `isValid` = has trimmed `name` AND `price` > 0. `invalidReason` ∈ {`missing_name`, `missing_price`, `invalid_price`}. Nested-field absence does NOT affect validity (FR-008).
