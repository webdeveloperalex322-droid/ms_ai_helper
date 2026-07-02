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

export interface ProductApiResponse {
  id: string;
  /** Plain product GUID, shared across cities/targets; `id` is this value suffixed with target. */
  productId?: string;
  name: string;
  categoryId?: string;
  categoryName?: string;
  description?: string;
  price?: number;
  oldPrice?: number;
  ingredients?: string[];
  allergens?: string[];
  tags?: string[];
  weight?: number;
  pieces?: number;
  calories?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
  imageUrl?: string;
  isAvailable?: boolean;
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
}
