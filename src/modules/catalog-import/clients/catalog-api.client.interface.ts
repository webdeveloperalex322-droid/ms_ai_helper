export const CATALOG_API_CLIENT_TOKEN = 'CATALOG_API_CLIENT';

export interface CityApiResponse {
  id: string;
  /** br = business region GUID, may be same as id */
  br?: string;
  name: string;
  isActive?: boolean;
  [key: string]: any;
}

export interface ProductApiResponse {
  id: string;
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
  getProductsByCategory(
    rn: string,
    br: string,
    target: string,
    categoryId: string,
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
