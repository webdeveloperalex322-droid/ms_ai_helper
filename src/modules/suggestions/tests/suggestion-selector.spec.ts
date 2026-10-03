import { describe, it, expect } from 'vitest';
import {
  SuggestionSelectorService,
  type SelectionCandidate,
} from '../services/suggestion-selector.service';
import { CART_ADDON_CODES } from '../services/suggestion-context';

const CONFIG_VALUES: Record<string, number> = {
  SUGGESTIONS_SERVICE_QUOTA_MIN: 1,
  SUGGESTIONS_SERVICE_QUOTA_MAX: 2,
  SUGGESTIONS_STATS_MIN_IMPRESSIONS: 50,
  SUGGESTIONS_CTR_WEIGHT: 2.0,
  SUGGESTIONS_EXPLORATION_BONUS: 0.15,
  SUGGESTIONS_DAYPART_BOOST: 1.5,
  SUGGESTIONS_CONTEXT_BOOST: 2.0,
};

function makeSelector(overrides: Record<string, number> = {}) {
  const values = { ...CONFIG_VALUES, ...overrides };
  const config = { get: (key: string) => values[key] };
  return new SuggestionSelectorService(config as any);
}

function product(code: string, sortOrder = 100, scenario?: string): SelectionCandidate {
  return { id: `id-${code}`, code, title: code, sortOrder, kind: 'product', scenario };
}

function service(code: string, sortOrder = 300): SelectionCandidate {
  return { id: `id-${code}`, code, title: code, sortOrder, kind: 'service' };
}

const PRODUCTS = Array.from({ length: 20 }, (_, i) => product(`p${i}`, 10 + i * 10));
const SERVICES = Array.from({ length: 6 }, (_, i) => service(`s${i}`, 300 + i * 10));

describe('SuggestionSelectorService — set size and uniqueness', () => {
  it('returns exactly the limit when there are enough candidates', () => {
    const result = makeSelector().select({
      candidates: [...PRODUCTS, ...SERVICES],
      limit: 6,
      context: 'catalog',
      seed: 'visit-1',
    });

    expect(result).toHaveLength(6);
  });

  it('returns everything available when candidates are fewer than the limit', () => {
    const result = makeSelector().select({
      candidates: PRODUCTS.slice(0, 3),
      limit: 6,
      context: 'catalog',
      seed: 'visit-1',
    });

    expect(result).toHaveLength(3);
  });

  it('returns an empty set for no candidates', () => {
    const result = makeSelector().select({
      candidates: [],
      limit: 6,
      context: 'catalog',
      seed: 'visit-1',
    });

    expect(result).toEqual([]);
  });

  it('never repeats a suggestion', () => {
    for (let i = 0; i < 50; i++) {
      const result = makeSelector().select({
        candidates: [...PRODUCTS, ...SERVICES],
        limit: 6,
        context: 'catalog',
        seed: `visit-${i}`,
      });

      expect(new Set(result.map((r) => r.id)).size).toBe(result.length);
    }
  });
});

describe('SuggestionSelectorService — type quota in the catalogue', () => {
  it('keeps service suggestions between one and two', () => {
    for (let i = 0; i < 50; i++) {
      const result = makeSelector().select({
        candidates: [...PRODUCTS, ...SERVICES],
        limit: 6,
        context: 'catalog',
        seed: `visit-${i}`,
      });

      const services = result.filter((r) => r.kind === 'service').length;
      expect(services).toBeGreaterThanOrEqual(1);
      expect(services).toBeLessThanOrEqual(2);
    }
  });

  it('fills the set with products when no service suggestion is eligible', () => {
    const result = makeSelector().select({
      candidates: PRODUCTS,
      limit: 6,
      context: 'catalog',
      seed: 'visit-1',
    });

    expect(result).toHaveLength(6);
    expect(result.every((r) => r.kind === 'product')).toBe(true);
  });

  it('fills the set with service suggestions when no product is eligible', () => {
    const result = makeSelector().select({
      candidates: SERVICES,
      limit: 6,
      context: 'catalog',
      seed: 'visit-1',
    });

    expect(result).toHaveLength(6);
    expect(result.every((r) => r.kind === 'service')).toBe(true);
  });
});

describe('SuggestionSelectorService — context floor', () => {
  const addons = CART_ADDON_CODES.map((code, i) => product(code, 200 + i * 10));

  it('gives add-ons at least two thirds of the cart set', () => {
    for (let i = 0; i < 30; i++) {
      const result = makeSelector().select({
        candidates: [...PRODUCTS, ...addons],
        limit: 6,
        context: 'cart',
        seed: `visit-${i}`,
      });

      const addonCount = result.filter((r) =>
        (CART_ADDON_CODES as readonly string[]).includes(r.code),
      ).length;
      expect(addonCount).toBeGreaterThanOrEqual(4);
    }
  });

  it('gives service questions at least two thirds of the checkout set', () => {
    for (let i = 0; i < 30; i++) {
      const result = makeSelector().select({
        candidates: [...PRODUCTS, ...SERVICES],
        limit: 6,
        context: 'checkout',
        seed: `visit-${i}`,
      });

      const services = result.filter((r) => r.kind === 'service').length;
      expect(services).toBeGreaterThanOrEqual(4);
    }
  });

  it('takes every profile candidate available when there are too few', () => {
    const result = makeSelector().select({
      candidates: [...PRODUCTS, product('drinks', 200)],
      limit: 6,
      context: 'cart',
      seed: 'visit-1',
    });

    expect(result).toHaveLength(6);
    expect(result.map((r) => r.code)).toContain('drinks');
  });
});

describe('SuggestionSelectorService — determinism and rotation', () => {
  it('returns the same set and order for the same seed', () => {
    const input = {
      candidates: [...PRODUCTS, ...SERVICES],
      limit: 6,
      context: 'catalog' as const,
      seed: 'visit-1',
    };

    const first = makeSelector().select(input);
    const second = makeSelector().select(input);

    expect(first.map((r) => r.code)).toEqual(second.map((r) => r.code));
  });

  it('returns a different set for a different seed', () => {
    const base = {
      candidates: [...PRODUCTS, ...SERVICES],
      limit: 6,
      context: 'catalog' as const,
    };

    const first = makeSelector().select({ ...base, seed: 'visit-1' });
    const second = makeSelector().select({ ...base, seed: 'visit-2' });

    expect(first.map((r) => r.code)).not.toEqual(second.map((r) => r.code));
  });

  it('covers most of the catalogue across many seeds', () => {
    const seen = new Set<string>();

    for (let i = 0; i < 60; i++) {
      const result = makeSelector().select({
        candidates: [...PRODUCTS, ...SERVICES],
        limit: 6,
        context: 'catalog',
        seed: `visit-${i}`,
      });
      result.forEach((r) => seen.add(r.code));
    }

    const total = PRODUCTS.length + SERVICES.length;
    expect(seen.size / total).toBeGreaterThanOrEqual(0.7);
  });
});

describe('SuggestionSelectorService — statistics', () => {
  const candidates = PRODUCTS.slice(0, 10);

  function hitRate(stats: Map<string, { shown: number; clicked: number }> | null, code: string) {
    let hits = 0;

    for (let i = 0; i < 200; i++) {
      const result = makeSelector().select({
        candidates,
        limit: 3,
        context: 'catalog',
        seed: `visit-${i}`,
        stats,
      });
      if (result.some((r) => r.code === code)) hits++;
    }

    return hits;
  }

  it('shows a suggestion with a trusted high click share more often', () => {
    const target = candidates[candidates.length - 1]; // worst sort_order
    const withoutStats = hitRate(null, target.code);

    const stats = new Map([[target.id, { shown: 500, clicked: 400 }]]);
    const withStats = hitRate(stats, target.code);

    expect(withStats).toBeGreaterThan(withoutStats);
  });

  it('ignores a click share below the impressions threshold', () => {
    const target = candidates[candidates.length - 1];
    const baseline = hitRate(null, target.code);

    // 5 shown / 5 clicked — a perfect but meaningless CTR.
    const stats = new Map([[target.id, { shown: 5, clicked: 5 }]]);

    expect(hitRate(stats, target.code)).toBe(baseline);
  });

  it('still shows a suggestion that has never been shown', () => {
    const fresh = product('brand_new', 900);
    const stats = new Map(candidates.map((c) => [c.id, { shown: 500, clicked: 250 }] as const));

    let hits = 0;
    for (let i = 0; i < 200; i++) {
      const result = makeSelector().select({
        candidates: [...candidates, fresh],
        limit: 3,
        context: 'catalog',
        seed: `visit-${i}`,
        stats,
      });
      if (result.some((r) => r.code === 'brand_new')) hits++;
    }

    expect(hits).toBeGreaterThan(0);
  });
});

describe('SuggestionSelectorService — day part', () => {
  const dayPartOf = (scenario: string | null | undefined) => {
    if (scenario === 'lunch') return 'lunch';
    if (scenario === 'evening' || scenario === 'dinner' || scenario === 'movie') return 'evening';
    return null;
  };

  const candidates = [
    ...PRODUCTS.slice(0, 8),
    product('lunch_combo', 500, 'lunch'),
    product('evening_set', 500, 'evening'),
  ];

  function hitRate(code: string, currentDayPart: string) {
    let hits = 0;

    for (let i = 0; i < 200; i++) {
      const result = makeSelector().select({
        candidates,
        limit: 3,
        context: 'catalog',
        seed: `visit-${i}`,
        currentDayPart,
        dayPartOf,
      });
      if (result.some((r) => r.code === code)) hits++;
    }

    return hits;
  }

  it('shows a lunch scenario more often at lunch than in the evening', () => {
    expect(hitRate('lunch_combo', 'lunch')).toBeGreaterThan(hitRate('lunch_combo', 'evening'));
  });

  it('leaves suggestions without a scenario unaffected by the day part', () => {
    const neutral = PRODUCTS[0].code;
    expect(hitRate(neutral, 'lunch')).toBe(hitRate(neutral, 'evening'));
  });
});
