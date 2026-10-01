import { describe, it, expect, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { CatalogService } from '@/modules/catalog/services/catalog.service';
import { CategoryResolverService } from '@/modules/catalog/services/category-resolver.service';
import { HybridRetrieverService } from '@/modules/rag/services/hybrid-retriever.service';
import { ShortlistBuilderService } from '@/modules/assistant/services/shortlist-builder.service';
import { IntentResult } from '@/modules/assistant/providers/llm.provider.interface';

const RN = 'rn-prod';
const BR = 'br-prod';
const TARGET = 'WEB';

/**
 * Catalog shaped like a real import: the directory maps a slug/name to the supplier's id,
 * and products reference the category by whichever form the API sent — on the live catalog
 * that is the SLUG (`rolly`), not the directory id. Before the fix the raw slot (`roll`) was
 * compared to `products.category_id` directly, so this shape always produced an empty shortlist.
 */
const CATEGORY_ROWS = [
  { categoryId: 'CAT-ROLL', slug: 'rolly', name: 'Роллы' },
  { categoryId: 'CAT-SET', slug: 'sety', name: 'Сеты' },
  { categoryId: 'CAT-DRINK', slug: 'napitki', name: 'Напитки' },
];

const CATALOG_ROWS = [
  {
    products: {
      id: 'p-roll-1',
      name: 'Филадельфия',
      // Live shape: the product stores the category slug.
      categoryId: 'rolly',
      ingredients: ['лосось'],
      allergens: null,
      tags: null,
      imageUrl: null,
    },
    city_products: { price: '499', currency: 'RUB', isAvailable: true },
  },
  {
    products: {
      id: 'p-set-1',
      name: 'Сет Токио',
      // Directory-id shape, as seeded/mock catalogs store it.
      categoryId: 'CAT-SET',
      ingredients: ['лосось'],
      allergens: null,
      tags: null,
      imageUrl: null,
    },
    city_products: { price: '1890', currency: 'RUB', isAvailable: true },
  },
  {
    products: {
      id: 'p-drink-1',
      name: 'Кола',
      categoryId: 'napitki',
      ingredients: null,
      allergens: null,
      tags: null,
      imageUrl: null,
    },
    city_products: { price: '120', currency: 'RUB', isAvailable: true },
  },
];

/**
 * Minimal drizzle stand-in: the category lookup uses select().from().where(), the catalog
 * query adds two innerJoin() calls. The catalog condition is rendered to real SQL so the
 * category filter is applied the same way Postgres would apply it.
 */
function makeDb() {
  const catalogWhere = vi.fn(async (condition: any) => {
    const { sql, params } = new PgDialect().sqlToQuery(condition);
    if (!sql.includes('"category_id" in')) return CATALOG_ROWS;
    return CATALOG_ROWS.filter((row) => params.includes(row.products.categoryId));
  });

  return {
    select: () => ({
      from: () => ({
        where: async () => CATEGORY_ROWS,
        innerJoin: () => ({ innerJoin: () => ({ where: catalogWhere }) }),
      }),
    }),
  };
}

function makeShortlistBuilder(vectorHits: { productId: string; score: number }[] = []) {
  const db = makeDb();
  const catalogService = new CatalogService(db as any);
  const categoryResolver = new CategoryResolverService(db as any);

  const retriever = new HybridRetrieverService(
    { search: vi.fn().mockResolvedValue(vectorHits) } as any,
    { search: vi.fn().mockResolvedValue([]) } as any,
    { embedQuery: vi.fn().mockResolvedValue([0.1, 0.2]) } as any,
    catalogService,
  );

  return new ShortlistBuilderService(retriever, categoryResolver);
}

function intent(slots: Record<string, any>): IntentResult {
  return {
    intent: 'product_recommendation',
    slots: slots as IntentResult['slots'],
    need_clarification: false,
    clarification_question: null,
    confidence: 0.9,
  };
}

describe('category filtering over a real-shaped catalog', () => {
  it('returns only products of the requested category for the legacy slot value', async () => {
    const builder = makeShortlistBuilder([
      { productId: 'p-roll-1', score: 0.8 },
      { productId: 'p-set-1', score: 0.7 },
      { productId: 'p-drink-1', score: 0.6 },
    ]);

    const shortlist = await builder.build(intent({ category: 'roll' }), RN, BR, TARGET);

    expect(shortlist.map((c) => c.product_id)).toEqual(['p-roll-1']);
  });

  it('returns products of the requested category when search returns no hits at all', async () => {
    const builder = makeShortlistBuilder([]);

    const shortlist = await builder.build(intent({ category: 'set' }), RN, BR, TARGET);

    expect(shortlist.map((c) => c.product_id)).toEqual(['p-set-1']);
  });

  it('does not empty the shortlist when the category does not exist in the catalog', async () => {
    const builder = makeShortlistBuilder([{ productId: 'p-roll-1', score: 0.8 }]);

    const shortlist = await builder.build(intent({ category: 'фывапролдж' }), RN, BR, TARGET);

    expect(shortlist.length).toBeGreaterThan(0);
  });

  it('combines the category filter with a budget limit', async () => {
    const builder = makeShortlistBuilder([]);

    const shortlist = await builder.build(
      intent({ category: 'роллы', budget_max: 1000 }),
      RN,
      BR,
      TARGET,
    );

    expect(shortlist.map((c) => c.product_id)).toEqual(['p-roll-1']);
  });

  it('reports the catalog display name for the resolved category', async () => {
    const builder = makeShortlistBuilder([]);

    const result = await builder.buildWithContext(intent({ category: 'roll' }), RN, BR, TARGET);

    expect(result.categoryLabel).toBe('Роллы');
  });
});
