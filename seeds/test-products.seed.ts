import { DrizzleDB } from '../src/database/database.module';
import { products, cityProducts } from '../src/database/schema';
import { randomUUID } from 'crypto';
import { TEST_RN, TEST_BR } from './test-data.seed';

export const TEST_TARGET = 'WEB';

export interface TestProduct {
  id: string;
  externalId: string;
  name: string;
  categoryId: string;
  categoryName: string;
  description: string;
  ingredients: string[];
  allergens: string[];
  tags: string[];
  weight: number;
  pieces: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  price: number;
  imageUrl: string | null;
}

export const TEST_PRODUCTS: TestProduct[] = [
  {
    id: 'aaaaaaaa-0001-0001-0001-000000000001',
    externalId: 'eeeeeeee-0001-0001-0001-000000000001',
    name: 'Ролл Лосось Классик',
    categoryId: 'roll',
    categoryName: 'Роллы',
    description: 'Нежный лосось с рисом и нори. Классическое сочетание.',
    ingredients: ['рис', 'лосось', 'нори', 'авокадо', 'огурец'],
    allergens: ['рыба'],
    tags: ['лосось', 'популярное', 'нежный'],
    weight: 240,
    pieces: 8,
    calories: 280,
    protein: 14,
    fat: 9,
    carbs: 36,
    price: 690,
    imageUrl: null,
  },
  {
    id: 'aaaaaaaa-0002-0002-0002-000000000002',
    externalId: 'eeeeeeee-0002-0002-0002-000000000002',
    name: 'Ролл Лосось Авокадо',
    categoryId: 'roll',
    categoryName: 'Роллы',
    description: 'Лосось и авокадо — идеальный дуэт. Сливочный вкус.',
    ingredients: ['рис', 'лосось', 'авокадо', 'нори', 'сливочный сыр'],
    allergens: ['рыба', 'молоко'],
    tags: ['лосось', 'авокадо', 'нежный', 'сливочный сыр'],
    weight: 260,
    pieces: 8,
    calories: 320,
    protein: 15,
    fat: 12,
    carbs: 38,
    price: 790,
    imageUrl: null,
  },
  {
    id: 'aaaaaaaa-0003-0003-0003-000000000003',
    externalId: 'eeeeeeee-0003-0003-0003-000000000003',
    name: 'Спайси Тунец',
    categoryId: 'roll',
    categoryName: 'Роллы',
    description: 'Острый тунец с соусом спайси. Для любителей пикантного.',
    ingredients: ['рис', 'тунец', 'нори', 'спайси-соус', 'огурец'],
    allergens: ['рыба'],
    tags: ['тунец', 'острый', 'популярное'],
    weight: 220,
    pieces: 8,
    calories: 260,
    protein: 16,
    fat: 7,
    carbs: 34,
    price: 650,
    imageUrl: null,
  },
  {
    id: 'aaaaaaaa-0004-0004-0004-000000000004',
    externalId: 'eeeeeeee-0004-0004-0004-000000000004',
    name: 'Роллы Калифорния',
    categoryId: 'roll',
    categoryName: 'Роллы',
    description: 'Классическая Калифорния с крабом и авокадо.',
    ingredients: ['рис', 'краб', 'авокадо', 'огурец', 'икра тобико'],
    allergens: ['рыба', 'ракообразные'],
    tags: ['краб', 'авокадо', 'популярное'],
    weight: 280,
    pieces: 8,
    calories: 310,
    protein: 13,
    fat: 10,
    carbs: 40,
    price: 720,
    imageUrl: null,
  },
  {
    id: 'aaaaaaaa-0005-0005-0005-000000000005',
    externalId: 'eeeeeeee-0005-0005-0005-000000000005',
    name: 'Суши Сет Премиум',
    categoryId: 'set',
    categoryName: 'Сеты',
    description: 'Большой сет с ассорти из 30 штук. Лосось, тунец, краб, авокадо.',
    ingredients: ['рис', 'лосось', 'тунец', 'краб', 'авокадо', 'нори'],
    allergens: ['рыба', 'ракообразные'],
    tags: ['сет', 'популярное', 'большой', 'premium', 'подарок'],
    weight: 900,
    pieces: 30,
    calories: 1200,
    protein: 55,
    fat: 35,
    carbs: 150,
    price: 1890,
    imageUrl: null,
  },
  {
    id: 'aaaaaaaa-0006-0006-0006-000000000006',
    externalId: 'eeeeeeee-0006-0006-0006-000000000006',
    name: 'Ролл Огурец Вегетарианский',
    categoryId: 'roll',
    categoryName: 'Роллы',
    description: 'Освежающий ролл без мяса и рыбы. Огурец и авокадо.',
    ingredients: ['рис', 'огурец', 'авокадо', 'нори'],
    allergens: [],
    tags: ['вегетарианский', 'без мяса', 'лёгкое'],
    weight: 180,
    pieces: 8,
    calories: 180,
    protein: 4,
    fat: 4,
    carbs: 35,
    price: 490,
    imageUrl: null,
  },
];

export async function seedTestProducts(db: DrizzleDB): Promise<void> {
  for (const p of TEST_PRODUCTS) {
    await db
      .insert(products)
      .values({
        id: p.id,
        rn: TEST_RN,
        externalProductId: p.externalId,
        name: p.name,
        categoryId: p.categoryId,
        categoryName: p.categoryName,
        description: p.description,
        ingredients: p.ingredients,
        allergens: p.allergens,
        tags: p.tags,
        weight: String(p.weight),
        pieces: p.pieces,
        calories: String(p.calories),
        protein: String(p.protein),
        fat: String(p.fat),
        carbs: String(p.carbs),
        imageUrl: p.imageUrl,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [products.rn, products.externalProductId],
        set: {
          name: p.name,
          description: p.description,
          ingredients: p.ingredients,
          allergens: p.allergens,
          tags: p.tags,
          updatedAt: new Date(),
        },
      });

    await db
      .insert(cityProducts)
      .values({
        id: randomUUID(),
        rn: TEST_RN,
        br: TEST_BR,
        target: TEST_TARGET,
        productId: p.id,
        price: String(p.price),
        oldPrice: null,
        currency: 'RUB',
        isAvailable: true,
        isValid: true,
        importedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [cityProducts.rn, cityProducts.br, cityProducts.target, cityProducts.productId],
        set: {
          price: String(p.price),
          isAvailable: true,
          isValid: true,
          importedAt: new Date(),
        },
      });
  }

  console.log(`Seeded ${TEST_PRODUCTS.length} test products for br=${TEST_BR}`);
}
