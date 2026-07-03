import { Injectable } from '@nestjs/common';
import {
  CatalogApiClient,
  CategoryApiResponse,
  CityApiResponse,
  ProductApiResponse,
} from './catalog-api.client.interface';
const TEST_CITY_BR = '11111111-1111-1111-1111-111111111111';

const MOCK_CATEGORIES: CategoryApiResponse[] = [
  {
    categoryId: 'CAT-MAIN',
    slug: 'main',
    name: 'Для вас',
    parentId: 0,
    orderIndex: 1,
    isDefault: true,
    target: 'WEB',
  },
  {
    categoryId: 'CAT-ROLL',
    slug: 'roll',
    name: 'Роллы',
    parentId: 0,
    orderIndex: 2,
    isDefault: false,
    target: 'WEB',
  },
  {
    categoryId: 'CAT-SET',
    slug: 'set',
    name: 'Сеты',
    parentId: 0,
    orderIndex: 3,
    isDefault: false,
    target: 'WEB',
  },
];

const MOCK_CITIES: CityApiResponse[] = [
  { id: TEST_CITY_BR, name: 'Москва', isActive: true, br: TEST_CITY_BR },
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Санкт-Петербург',
    isActive: true,
    br: '22222222-2222-2222-2222-222222222222',
  },
];

/**
 * Build a real-shaped mock product. КЖБУ/description/ingredients/categoryName are
 * NESTED exactly like the venus API so the normalizer + tests exercise the true paths.
 */
function makeMockProduct(p: {
  id: string;
  productId: string;
  name: string;
  categorySlug: string;
  categoryId: string;
  categoryName: string;
  description: string;
  price: number;
  composition: string;
  weight: number;
  pieces: number;
  calorie: number;
  proteins: number;
  fat: number;
  carbohydrates: number;
  imageUrl: string;
}): ProductApiResponse {
  return {
    id: p.id,
    productId: p.productId,
    name: p.name,
    // top-level categoryId is the slug the mock filters on (getProductsByCategory)
    categoryId: p.categorySlug,
    mainCategotyId: p.categoryId,
    productDescription: p.description,
    price: p.price,
    oldPrice: 0,
    imageUrl: p.imageUrl,
    isAvailable: true,
    localization: [{ language: 'ru', name: p.name, productDescription: p.description }],
    classifiers: [
      {
        categoryId: p.categoryId,
        name: p.categoryName,
        isMain: true,
        localization: [{ language: 'ru', name: p.categoryName }],
      },
    ],
    additionalProperties: {
      pieces: p.pieces,
      nutritional: {
        calorie: p.calorie,
        proteins: p.proteins,
        fat: p.fat,
        carbohydrates: p.carbohydrates,
        weight: p.weight,
        composition: { value: p.composition },
      },
    },
  };
}

const MOCK_PRODUCTS: ProductApiResponse[] = [
  makeMockProduct({
    id: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA',
    productId: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA',
    name: 'Филадельфия классическая',
    categorySlug: 'roll',
    categoryId: 'CAT-ROLL',
    categoryName: 'Роллы',
    description: 'Нежный ролл с лососем и сливочным сыром',
    price: 499,
    composition: 'лосось, сливочный сыр, огурец, рис, нори',
    weight: 250,
    pieces: 8,
    calorie: 320,
    proteins: 12,
    fat: 14,
    carbohydrates: 38,
    imageUrl: 'https://example.com/philadelphia.jpg',
  }),
  makeMockProduct({
    id: 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB',
    productId: 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB',
    name: 'Ролл Калифорния',
    categorySlug: 'roll',
    categoryId: 'CAT-ROLL',
    categoryName: 'Роллы',
    description: 'Классическая Калифорния с крабом и авокадо',
    price: 449,
    composition: 'краб, авокадо, огурец, рис, нори, тобико',
    weight: 220,
    pieces: 8,
    calorie: 280,
    proteins: 10,
    fat: 10,
    carbohydrates: 35,
    imageUrl: 'https://example.com/california.jpg',
  }),
  makeMockProduct({
    id: 'CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC',
    productId: 'CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC',
    name: 'Ролл с лососем острый',
    categorySlug: 'roll',
    categoryId: 'CAT-ROLL',
    categoryName: 'Роллы',
    description: 'Острый ролл с лососем и соусом спайси',
    price: 529,
    composition: 'лосось, соус спайси, огурец, рис, нори',
    weight: 230,
    pieces: 8,
    calorie: 310,
    proteins: 13,
    fat: 12,
    carbohydrates: 37,
    imageUrl: 'https://example.com/salmon-spicy.jpg',
  }),
  makeMockProduct({
    id: 'DDDDDDDD-DDDD-DDDD-DDDD-DDDDDDDDDDDD',
    productId: 'DDDDDDDD-DDDD-DDDD-DDDD-DDDDDDDDDDDD',
    name: 'Сет Лосось дуэт',
    categorySlug: 'set',
    categoryId: 'CAT-SET',
    categoryName: 'Сеты',
    description: 'Сет для двоих с роллами лосося',
    price: 1190,
    composition: 'лосось, сливочный сыр, огурец, рис, нори',
    weight: 600,
    pieces: 24,
    calorie: 780,
    proteins: 32,
    fat: 36,
    carbohydrates: 96,
    imageUrl: 'https://example.com/set-salmon-duo.jpg',
  }),
  makeMockProduct({
    id: 'EEEEEEEE-EEEE-EEEE-EEEE-EEEEEEEEEEEE',
    productId: 'EEEEEEEE-EEEE-EEEE-EEEE-EEEEEEEEEEEE',
    name: 'Сет Токио',
    categorySlug: 'set',
    categoryId: 'CAT-SET',
    categoryName: 'Сеты',
    description: 'Большой сет с ассорти роллов',
    price: 1890,
    composition: 'лосось, тунец, краб, авокадо, огурец, рис, нори',
    weight: 900,
    pieces: 36,
    calorie: 1200,
    proteins: 48,
    fat: 42,
    carbohydrates: 140,
    imageUrl: 'https://example.com/set-tokyo.jpg',
  }),
];

@Injectable()
export class CatalogApiMockClient implements CatalogApiClient {
  async getCities(_rn: string): Promise<CityApiResponse[]> {
    return MOCK_CITIES;
  }

  async getCategories(
    _rn: string,
    _slug: string,
    _target: string,
  ): Promise<{ br: string; categories: CategoryApiResponse[] }> {
    return { br: TEST_CITY_BR, categories: MOCK_CATEGORIES };
  }

  async getProductsByCategory(
    _rn: string,
    _br: string,
    _target: string,
    categorySlug: string,
  ): Promise<ProductApiResponse[]> {
    if (!categorySlug) return MOCK_PRODUCTS;
    return MOCK_PRODUCTS.filter((p) => p.categoryId === categorySlug);
  }

  async getProductsByIds(
    _rn: string,
    _br: string,
    _target: string,
    ids: string[],
  ): Promise<ProductApiResponse[]> {
    return MOCK_PRODUCTS.filter((p) => ids.includes(p.id));
  }

  async getProductById(
    _rn: string,
    _br: string,
    _target: string,
    productId: string,
  ): Promise<ProductApiResponse | null> {
    return MOCK_PRODUCTS.find((p) => p.id === productId) ?? null;
  }
}
