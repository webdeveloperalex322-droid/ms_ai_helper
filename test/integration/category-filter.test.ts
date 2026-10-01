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
      // Live shape: products carry a SUBcategory id that is absent from the directory,
      // so only category_name links them back to the "Роллы" entry.
      categoryId: 'SUB-620E38C0',
      categoryName: 'Роллы',
      ingredients: ['лосось'],
      allergens: null,
      tags: null,
      imageUrl: null,
    },
    city_products: { price: '499', currency: 'RUB', isAvailable: true },
  },
  {
    products: {
      id: 'p-roll-2',
      name: 'Калифорния',
      // A second subcategory id under the very same directory category.
      categoryId: 'SUB-4CAB8550',
      categoryName: 'Роллы',
      ingredients: ['краб'],
      allergens: null,
      tags: null,
      imageUrl: null,
    },
    city_products: { price: '399', currency: 'RUB', isAvailable: true },
  },
  {
    products: {
      id: 'p-set-1',
      name: 'Сет Токио',
      // Directory-id shape, as seeded/mock catalogs store it.
      categoryId: 'CAT-SET',
      categoryName: 'Сеты',
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
      categoryName: 'Напитки',
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
    const byId = sql.includes('"category_id" in');
    const byName = sql.includes('category_name') && sql.includes(' in ');

    let rows = CATALOG_ROWS;

    if (byId || byName) {
      rows = rows.filter(
        (row) =>
          (byId && params.includes(row.products.categoryId)) ||
          (byName && params.includes(row.products.categoryName.toLowerCase())),
      );
    }

    // Apply the budget bound the same way Postgres would, reading it off the placeholder.
    const budget = sql.match(/"price" <= \$(\d+)/);
    if (budget) {
      const limit = Number(params[Number(budget[1]) - 1]);
      rows = rows.filter((row) => Number(row.city_products.price) <= limit);
    }

    return rows;
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

  it('gathers every subcategory of the requested category via the category name', async () => {
    const builder = makeShortlistBuilder([
      { productId: 'p-roll-1', score: 0.8 },
      { productId: 'p-roll-2', score: 0.75 },
      { productId: 'p-drink-1', score: 0.6 },
    ]);

    const shortlist = await builder.build(intent({ category: 'rolly' }), RN, BR, TARGET);

    expect(shortlist.map((c) => c.product_id).sort()).toEqual(['p-roll-1', 'p-roll-2']);
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
      intent({ category: 'роллы', budget_max: 450 }),
      RN,
      BR,
      TARGET,
    );

    // Both rolls are in the category; only the 399 ₽ one fits the budget.
    expect(shortlist.map((c) => c.product_id)).toEqual(['p-roll-2']);
  });

  it('reports the catalog display name for the resolved category', async () => {
    const builder = makeShortlistBuilder([]);

    const result = await builder.buildWithContext(intent({ category: 'roll' }), RN, BR, TARGET);

    expect(result.categoryLabel).toBe('Роллы');
  });
});
