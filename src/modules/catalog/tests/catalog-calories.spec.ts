import { describe, it, expect, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { CatalogService } from '../services/catalog.service';

const RN = 'rn-test';
const BR = 'br-test';
const TARGET = 'WEB';

const ROWS = [
  {
    products: {
      id: 'light',
      name: 'Овощной ролл',
      calories: '120',
      categoryId: null,
      categoryName: null,
    },
    city_products: { price: '299', currency: 'RUB', isAvailable: true },
  },
  {
    products: {
      id: 'heavy',
      name: 'Запечённый ролл',
      calories: '420',
      categoryId: null,
      categoryName: null,
    },
    city_products: { price: '399', currency: 'RUB', isAvailable: true },
  },
  {
    products: {
      id: 'unknown',
      name: 'Ролл без КБЖУ',
      calories: null,
      categoryId: null,
      categoryName: null,
    },
    city_products: { price: '349', currency: 'RUB', isAvailable: true },
  },
];

/**
 * The calorie bound is rendered to real SQL and applied the way Postgres would,
 * so the test fails if the condition stops reaching the query.
 */
function makeService() {
  const where = vi.fn(async (condition: any) => {
    const { sql, params } = new PgDialect().sqlToQuery(condition);
    const bound = sql.match(/"calories" <= \$(\d+)/);

    if (!bound) return ROWS;

    const limit = Number(params[Number(bound[1]) - 1]);
    const nullKept = sql.includes('"calories" is null');

    return ROWS.filter((row) => {
      const value = row.products.calories;
      if (value === null) return nullKept;
      return Number(value) <= limit;
    });
  });

  const db = {
    select: () => ({
      from: () => ({ innerJoin: () => ({ innerJoin: () => ({ where }) }) }),
    }),
  };

  return { service: new CatalogService(db as any), where };
}

describe('CatalogService — calorie bound', () => {
  it('drops products above the bound', async () => {
    const { service } = makeService();

    const result = await service.findByCity(RN, BR, TARGET, { caloriesMax: 200 });

    expect(result.map((p) => p.id)).toContain('light');
    expect(result.map((p) => p.id)).not.toContain('heavy');
  });

  it('keeps products with no calorie figure', async () => {
    const { service } = makeService();

    const result = await service.findByCity(RN, BR, TARGET, { caloriesMax: 200 });

    expect(result.map((p) => p.id)).toContain('unknown');
  });

  it('does not touch the query when no bound is given', async () => {
    const { service } = makeService();

    const result = await service.findByCity(RN, BR, TARGET, {});

    expect(result).toHaveLength(3);
  });
});
