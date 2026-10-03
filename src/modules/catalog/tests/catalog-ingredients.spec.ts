import { describe, it, expect, vi } from 'vitest';
import { CatalogService } from '../services/catalog.service';

const RN = 'rn-test';
const BR = 'br-test';
const TARGET = 'WEB';

/** Ingredient strings exactly as the live catalogue writes them. */
const ROWS = [
  {
    products: {
      id: 'shrimp-panko',
      name: 'Креветки панко 9шт',
      ingredients: ['Креветки в панировке', 'спайси соус'],
      allergens: null,
    },
    city_products: { price: '399', isAvailable: true },
  },
  {
    products: {
      id: 'california',
      name: 'Ролл Калифорния классика',
      ingredients: ['Краб-микс соус', 'огурец', 'красная икра масаго', 'рис', 'нори'],
      allergens: null,
    },
    city_products: { price: '349', isAvailable: true },
  },
  {
    products: {
      id: 'veggie',
      name: 'Ролл овощной',
      ingredients: ['Авокадо', 'рис', 'нори'],
      allergens: null,
    },
    city_products: { price: '249', isAvailable: true },
  },
  {
    products: {
      id: 'cheese',
      name: 'Ролл с крем чизом',
      ingredients: ['Крем чиз', 'рис', 'нори'],
      allergens: ['молоко'],
    },
    city_products: { price: '299', isAvailable: true },
  },
];

function makeService() {
  const db = {
    select: () => ({
      from: () => ({ innerJoin: () => ({ innerJoin: () => ({ where: async () => ROWS }) }) }),
    }),
  };

  return new CatalogService(db as any);
}

describe('CatalogService — ingredient matching', () => {
  it('excludes by stem, so a plural free-text ingredient is caught', async () => {
    const result = await makeService().findByCity(RN, BR, TARGET, {
      excludedIngredients: ['креветк'],
    });

    expect(result.map((p) => p.id)).not.toContain('shrimp-panko');
  });

  it('prefers by substring, so "краб" finds "Краб-микс соус"', async () => {
    const result = await makeService().findByCity(RN, BR, TARGET, {
      preferredIngredients: ['краб'],
    });

    expect(result.map((p) => p.id)).toEqual(['california']);
  });

  it('matches an allergen as well as an ingredient on exclusion', async () => {
    const result = await makeService().findByCity(RN, BR, TARGET, {
      excludedIngredients: ['молоко'],
    });

    expect(result.map((p) => p.id)).not.toContain('cheese');
  });

  it('keeps products whose ingredients mention nothing excluded', async () => {
    const result = await makeService().findByCity(RN, BR, TARGET, {
      excludedIngredients: ['креветк', 'краб', 'чиз'],
    });

    expect(result.map((p) => p.id)).toEqual(['veggie']);
  });

  it('ignores blank entries in the list', async () => {
    const result = await makeService().findByCity(RN, BR, TARGET, {
      excludedIngredients: ['  '],
    });

    expect(result).toHaveLength(4);
  });
});
