# Contract: CatalogApiClient additions

Interface at `src/modules/catalog-import/clients/catalog-api.client.interface.ts`.
Both `CatalogApiHttpClient` (real) and `CatalogApiMockClient` implement it; swapped by
`CATALOG_API_MODE`.

## New response type

```ts
export interface CategoryApiResponse {
  categoryId: string;
  slug: string;
  name: string;
  parentId?: string | number;
  orderIndex?: number;
  classifierId?: number;
  isDefault?: boolean;
  iconUrl?: string;
  imageUrl?: string;
  target?: string;
  localization?: { language: string; name: string }[];
  [key: string]: any;
}
```

## New method

```ts
getCategories(
  rn: string,
  slug: string,
  target: string,
): Promise<{ br: string; categories: CategoryApiResponse[] }>;
```

- **HTTP impl**: `GET ${citiesBaseUrl}/v1/init?rn=${rn}&slug=${slug}&target=${target}`,
  return `{ br: data.businessRegion.id, categories: data.categories ?? [] }`.
- **Mock impl**: return a small fixed `br` + a few categories whose slugs match the mock
  product categories, at least one with `isDefault: true`.

## Existing method — bug fix

`getProductsByCategory(rn, br, target, categorySlug)`:

- **Before**: `...&cat=${categoryId}&withArchive=false`
- **After**: `...&category=${categorySlug}&withArchive=false`

The 4th argument is now semantically a **slug** (value passed through from stored
categories). No signature change required, only the URL param name and the value source.

## Existing type — extension

`CityApiResponse` gains `slug?: string` (already returned by `/v1/cities`).
