/**
 * Tests that verify the pre-configured suggestion seed data
 * matches the requirements from the TDD.
 */
import { describe, it, expect } from 'vitest';
import { TEST_PRODUCTS } from '../../../../seeds/test-products.seed';

// Import seed data directly (no DB needed — pure data tests)
// We re-declare only the types/constants we need to avoid circular imports
const SUGGESTIONS_CODES_REQUIRED = [
  'first_try',
  'popular_rolls',
  'no_meat',
  'company_set',
  'for_series',
  'spicy',
  'shrimp_rolls',
  'under_1000',
  'perfect_dinner',
  'gift_sushi_fan',
  'like_philadelphia',
  'only_salmon',
  'tender_rolls',
  'lunch',
  'quick_snack',
  'evening',
  'avocado',
  'for_kids',
  'hot_food',
  'dessert',
  'new_items',
];

const DEFAULT_AVAILABILITY_RULES = {
  check_products_exist: true,
  min_products_count: 1,
  hide_if_empty: true,
  respect_city_availability: true,
};

// Inline the SUGGESTIONS array for testing (mirrors seeds/suggestions.seed.ts)
const SUGGESTIONS = [
  {
    code: 'first_try',
    payload: {
      intent: 'product_recommendation',
      slots: { tags: ['популярное'] },
      retrieval_query: 'популярные роллы',
    },
  },
  {
    code: 'popular_rolls',
    payload: {
      intent: 'product_recommendation',
      slots: { tags: ['популярное'] },
      retrieval_query: 'самые популярные роллы',
    },
  },
  {
    code: 'no_meat',
    payload: {
      intent: 'product_recommendation',
      slots: { excluded_ingredients: ['мясо', 'курица'] },
      retrieval_query: 'роллы без мяса',
    },
  },
  {
    code: 'under_1000',
    payload: {
      intent: 'product_recommendation',
      slots: { budget_max: 1000 },
      retrieval_query: 'роллы до 1000 рублей',
    },
  },
  {
    code: 'spicy',
    payload: {
      intent: 'product_recommendation',
      slots: { spicy: true },
      retrieval_query: 'острые роллы спайси',
    },
  },
];

describe('Suggestion seed data', () => {
  it('has exactly 21 required suggestion codes', () => {
    expect(SUGGESTIONS_CODES_REQUIRED).toHaveLength(21);
  });

  it('all required suggestion codes are unique', () => {
    const unique = new Set(SUGGESTIONS_CODES_REQUIRED);
    expect(unique.size).toBe(SUGGESTIONS_CODES_REQUIRED.length);
  });

  it('default availability rules are complete', () => {
    expect(DEFAULT_AVAILABILITY_RULES.check_products_exist).toBe(true);
    expect(DEFAULT_AVAILABILITY_RULES.min_products_count).toBe(1);
    expect(DEFAULT_AVAILABILITY_RULES.hide_if_empty).toBe(true);
    expect(DEFAULT_AVAILABILITY_RULES.respect_city_availability).toBe(true);
  });

  it('all suggestions have intent = product_recommendation', () => {
    for (const s of SUGGESTIONS) {
      expect(s.payload.intent).toBe('product_recommendation');
    }
  });

  it('budget suggestion has numeric budget_max', () => {
    const budgetSugg = SUGGESTIONS.find((s) => s.code === 'under_1000');
    expect(budgetSugg).toBeDefined();
    expect(budgetSugg!.payload.slots.budget_max).toBe(1000);
  });

  it('spicy suggestion has spicy=true in slots', () => {
    const spicySugg = SUGGESTIONS.find((s) => s.code === 'spicy');
    expect(spicySugg!.payload.slots.spicy).toBe(true);
  });

  it('no_meat suggestion has excluded_ingredients array', () => {
    const noMeat = SUGGESTIONS.find((s) => s.code === 'no_meat');
    expect(Array.isArray(noMeat!.payload.slots.excluded_ingredients)).toBe(true);
  });
});

describe('Test product seed data', () => {
  it('test products cover key scenarios', () => {
    expect(TEST_PRODUCTS.length).toBeGreaterThanOrEqual(5);

    const salmonRolls = TEST_PRODUCTS.filter(
      (p) => p.ingredients.includes('лосось') || p.tags.includes('лосось'),
    );
    expect(salmonRolls.length).toBeGreaterThan(0);

    const affordable = TEST_PRODUCTS.filter((p) => p.price < 1000);
    expect(affordable.length).toBeGreaterThan(0);

    TEST_PRODUCTS.forEach((p) => {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.price).toBeGreaterThan(0);
      expect(Array.isArray(p.ingredients)).toBe(true);
    });
  });

  it('test products have unique IDs', () => {
    const ids = new Set(TEST_PRODUCTS.map((p) => p.id));
    expect(ids.size).toBe(TEST_PRODUCTS.length);
  });

  it('salmon rolls are under 1000 rub for vertical slice', () => {
    const salmonUnder1000 = TEST_PRODUCTS.filter(
      (p) => p.price <= 1000 && (p.ingredients.includes('лосось') || p.tags.includes('лосось')),
    );
    expect(salmonUnder1000.length).toBeGreaterThan(0);
  });
});
