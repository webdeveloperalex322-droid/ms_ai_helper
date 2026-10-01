import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { CatalogService } from '../services/catalog.service';

const RN = 'rn-test';
const BR = 'br-test';
const TARGET = 'WEB';

function makeRow(product: Partial<any> = {}, cityProduct: Partial<any> = {}) {
  return {
    products: {
      id: 'p1',
      name: 'Ролл',
      categoryId: 'CAT-ROLL',
      ingredients: null,
      allergens: null,
      tags: null,
      ...product,
    },
    city_products: { price: '499', isAvailable: true, currency: 'RUB', ...cityProduct },
  };
}

function makeDb(rows: any[] = [makeRow()]) {
  const where = vi.fn().mockResolvedValue(rows);
  const innerJoin2 = vi.fn().mockReturnValue({ where });
  const innerJoin1 = vi.fn().mockReturnValue({ innerJoin: innerJoin2 });
  const from = vi.fn().mockReturnValue({ innerJoin: innerJoin1 });
  const select = vi.fn().mockReturnValue({ from });
  return { select, from, where };
}

/** Renders the captured drizzle condition into real SQL so filters can be asserted. */
function capturedSql(db: ReturnType<typeof makeDb>): string {
  const condition = db.where.mock.calls[0][0];
  return new PgDialect().sqlToQuery(condition).sql;
}

describe('CatalogService.findByCity — category filter', () => {
  let db: ReturnType<typeof makeDb>;
  let service: CatalogService;

  beforeEach(() => {
    db = makeDb();
    service = new CatalogService(db as any);
  });

  it('filters by a single resolved category id', async () => {
    await service.findByCity(RN, BR, TARGET, { categoryIds: ['CAT-ROLL'] });

    expect(capturedSql(db)).toContain('"category_id" in');
  });

  it('filters by every resolved category id when several matched', async () => {
    await service.findByCity(RN, BR, TARGET, {
      categoryIds: ['CAT-ROLL', 'CAT-ROLL-PREMIUM'],
    });

    const { sql, params } = new PgDialect().sqlToQuery(db.where.mock.calls[0][0]);
    expect(sql).toContain('"category_id" in');
    expect(params).toContain('CAT-ROLL');
    expect(params).toContain('CAT-ROLL-PREMIUM');
  });

  it('applies no category condition when the list is empty', async () => {
    await service.findByCity(RN, BR, TARGET, { categoryIds: [] });

    expect(capturedSql(db)).not.toContain('"category_id"');
  });

  it('applies no category condition when the list is omitted', async () => {
    await service.findByCity(RN, BR, TARGET, {});

    expect(capturedSql(db)).not.toContain('"category_id"');
  });

  it('keeps the budget filter working alongside the category filter', async () => {
    await service.findByCity(RN, BR, TARGET, { categoryIds: ['CAT-ROLL'], budgetMax: 500 });

    const { sql, params } = new PgDialect().sqlToQuery(db.where.mock.calls[0][0]);
    expect(sql).toContain('"category_id" in');
    expect(sql).toContain('"price" <=');
    expect(params).toContain('500');
  });

  it('keeps in-memory ingredient exclusion working alongside the category filter', async () => {
    const withDb = makeDb([
      makeRow({ id: 'p1', ingredients: ['лосось'] }),
      makeRow({ id: 'p2', ingredients: ['креветка'] }),
    ]);
    const svc = new CatalogService(withDb as any);

    const results = await svc.findByCity(RN, BR, TARGET, {
      categoryIds: ['CAT-ROLL'],
      excludedIngredients: ['лосось'],
    });

    expect(results.map((r) => r.id)).toEqual(['p2']);
  });
});
