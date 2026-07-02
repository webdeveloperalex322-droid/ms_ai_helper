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

const MOCK_PRODUCTS: ProductApiResponse[] = [
  {
    id: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA',
    name: 'Филадельфия классическая',
    categoryId: 'roll',
    categoryName: 'Роллы',
    description: 'Нежный ролл с лососем и сливочным сыром',
    price: 499,
    ingredients: ['лосось', 'сливочный сыр', 'огурец', 'рис', 'нори'],
    allergens: ['рыба', 'молочные продукты', 'зерновые'],
    tags: ['лосось', 'нежный', 'сырный', 'без остроты', 'популярное'],
    weight: 250,
    pieces: 8,
    calories: 320,
    protein: 12,
    fat: 14,
    carbs: 38,
    imageUrl: 'https://example.com/philadelphia.jpg',
    isAvailable: true,
  },
  {
    id: 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB',
    name: 'Ролл Калифорния',
    categoryId: 'roll',
    categoryName: 'Роллы',
    description: 'Классическая Калифорния с крабом и авокадо',
    price: 449,
    ingredients: ['краб', 'авокадо', 'огурец', 'рис', 'нори', 'тобико'],
    allergens: ['ракообразные', 'зерновые'],
    tags: ['краб', 'авокадо', 'нежный', 'без остроты'],
    weight: 220,
    pieces: 8,
    calories: 280,
    protein: 10,
    fat: 10,
    carbs: 35,
    imageUrl: 'https://example.com/california.jpg',
    isAvailable: true,
  },
  {
    id: 'CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC',
    name: 'Ролл с лососем острый',
    categoryId: 'roll',
    categoryName: 'Роллы',
    description: 'Острый ролл с лососем и соусом спайси',
    price: 529,
    ingredients: ['лосось', 'соус спайси', 'огурец', 'рис', 'нори'],
    allergens: ['рыба', 'зерновые'],
    tags: ['лосось', 'острый', 'спайси'],
    weight: 230,
    pieces: 8,
    calories: 310,
    protein: 13,
    fat: 12,
    carbs: 37,
    imageUrl: 'https://example.com/salmon-spicy.jpg',
    isAvailable: true,
  },
  {
    id: 'DDDDDDDD-DDDD-DDDD-DDDD-DDDDDDDDDDDD',
    name: 'Сет Лосось дуэт',
    categoryId: 'set',
    categoryName: 'Сеты',
    description: 'Сет для двоих с роллами лосося',
    price: 1190,
    ingredients: ['лосось', 'сливочный сыр', 'огурец', 'рис', 'нори'],
    allergens: ['рыба', 'молочные продукты', 'зерновые'],
    tags: ['лосось', 'нежный', 'на двоих', 'сет'],
    weight: 600,
    pieces: 24,
    calories: 780,
    protein: 32,
    fat: 36,
    carbs: 96,
    imageUrl: 'https://example.com/set-salmon-duo.jpg',
    isAvailable: true,
  },
  {
    id: 'EEEEEEEE-EEEE-EEEE-EEEE-EEEEEEEEEEEE',
    name: 'Сет Токио',
    categoryId: 'set',
    categoryName: 'Сеты',
    description: 'Большой сет с ассорти роллов',
    price: 1890,
    ingredients: ['лосось', 'тунец', 'краб', 'авокадо', 'огурец', 'рис', 'нори'],
    allergens: ['рыба', 'ракообразные', 'зерновые'],
    tags: ['ассорти', 'большой', 'на троих', 'сет'],
    weight: 900,
    pieces: 36,
    calories: 1200,
    protein: 48,
    fat: 42,
    carbs: 140,
    imageUrl: 'https://example.com/set-tokyo.jpg',
    isAvailable: true,
  },
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
