export const CATALOG_API_CLIENT_TOKEN = 'CATALOG_API_CLIENT';

export interface CityApiResponse {
  id: string;
  /** br = business region GUID, may be same as id */
  br?: string;
  name: string;
  /** city slug used to address the city when fetching its categories (/v1/init) */
  slug?: string;
  isActive?: boolean;
  [key: string]: any;
}

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

/** One localized text block; the API ships an array, usually with a single `ru` entry. */
export interface ProductLocalization {
  language: string;
  name?: string;
  shortName?: string;
  productDescription?: string;
  promotionDetails?: string;
  [key: string]: any;
}

/** A category/classifier the product belongs to; `categoryName` is derived from these. */
export interface ProductClassifier {
  categoryId: string;
  name?: string;
  localization?: { language: string; name?: string }[];
  isMain?: boolean;
  isDefault?: boolean;
  slug?: string;
  target?: string;
  [key: string]: any;
}

/** Nutrition (КЖБУ) + composition, nested under additionalProperties in the real API. */
export interface ProductNutritional {
  /** kcal (note the singular API key) */
  calorie?: number;
  proteins?: number;
  fat?: number;
  /** carbs (note the API key spelling) */
  carbohydrates?: number;
  weight?: number;
  composition?: {
    /** comma-separated ingredient string */
    value?: string;
    localization?: { language: string; name?: string }[];
  };
  [key: string]: any;
}

export interface ProductAdditionalProperties {
  pieces?: number;
  cookingTime?: number;
  nutritional?: ProductNutritional;
  [key: string]: any;
}

/** One attribute badge/label from the /v1/attributes/PRODUCT catalog endpoint. */
export interface AttributeApiResponse {
  id: string;
  type?: string;
  attribute: {
    id: string;
    name: string;
    slug?: string;
    value?: string;
    backgroundColor?: string;
    textColor?: string;
    group?: {
      name: string;
      orderIndex?: number;
      localization?: unknown[];
    };
    localization?: unknown[];
    [key: string]: unknown;
  };
  _parent?: string;
  _createTime?: string;
  _updateTime?: string;
  [key: string]: unknown;
}

/** Attribute value stored on a product record (id + human-readable name). */
export interface ProductAttributeValue {
  id: string;
  name: string;
}

/**
 * Real venus catalog product shape. КЖБУ/description/ingredients/category name are
 * NESTED (not flat) — see additionalProperties.nutritional, localization[], classifiers[].
 * ProductNormalizerService reads these paths; the full object is persisted as rawPayload.
 */
export interface ProductApiResponse {
  /** Target-suffixed id, e.g. "<guid>-WEB". */
  id: string;
  /** Plain product GUID, shared across cities/targets; `id` is this value suffixed with target. */
  productId?: string;
  name: string;
  categoryId?: string;
  /** NOTE: source API misspelling ("Categoty") preserved intentionally — do not "fix". */
  mainCategotyId?: string;
  productDescription?: string;
  price?: number;
  oldPrice?: number;
  imageUrl?: string;
  isAvailable?: boolean;
  localization?: ProductLocalization[];
  classifiers?: ProductClassifier[];
  additionalProperties?: ProductAdditionalProperties;
  /** Attribute badges assigned to this product. */
  attributes?: Array<{ id: string; name?: string; [key: string]: unknown }>;
  [key: string]: any;
}

export interface CatalogApiClient {
  getCities(rn: string): Promise<CityApiResponse[]>;
  /** Fetch categories for a city (keyed by its slug); returns the businessRegion id as br. */
  getCategories(
    rn: string,
    slug: string,
    target: string,
  ): Promise<{ br: string; categories: CategoryApiResponse[] }>;
  getProductsByCategory(
    rn: string,
    br: string,
    target: string,
    categorySlug: string,
  ): Promise<ProductApiResponse[]>;
  getProductsByIds(
    rn: string,
    br: string,
    target: string,
    ids: string[],
  ): Promise<ProductApiResponse[]>;
  getProductById(
    rn: string,
    br: string,
    target: string,
    productId: string,
  ): Promise<ProductApiResponse | null>;
  getAttributes(rn: string): Promise<AttributeApiResponse[]>;
}
