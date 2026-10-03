import { describe, it, expect } from 'vitest';
import {
  isProfileForContext,
  matchesContext,
  normalizeScreenContext,
  resolveContexts,
  resolveKind,
} from '../services/suggestion-context';

describe('resolveContexts', () => {
  it('uses screenContexts when it is filled', () => {
    expect(
      resolveContexts({ screenContexts: ['catalog', 'cart'], screenContext: 'checkout' }),
    ).toEqual(['catalog', 'cart']);
  });

  it('falls back to the legacy single context', () => {
    expect(resolveContexts({ screenContexts: null, screenContext: 'cart' })).toEqual(['cart']);
  });

  it('falls back to the catalogue when both are empty', () => {
    expect(resolveContexts({ screenContexts: [], screenContext: null })).toEqual(['catalog']);
  });

  it('drops unknown values and deduplicates', () => {
    expect(
      resolveContexts({ screenContexts: ['cart', 'nonsense', 'cart'], screenContext: null }),
    ).toEqual(['cart']);
  });

  it('falls back to the catalogue when every value is unknown', () => {
    expect(resolveContexts({ screenContexts: ['nonsense'], screenContext: 'junk' })).toEqual([
      'catalog',
    ]);
  });
});

describe('matchesContext', () => {
  it('matches any of the listed contexts', () => {
    const suggestion = { screenContexts: ['catalog', 'cart'] };

    expect(matchesContext(suggestion, 'cart')).toBe(true);
    expect(matchesContext(suggestion, 'checkout')).toBe(false);
  });
});

describe('normalizeScreenContext', () => {
  it('keeps known contexts and maps everything else to the catalogue', () => {
    expect(normalizeScreenContext('checkout')).toBe('checkout');
    expect(normalizeScreenContext('unknown')).toBe('catalog');
    expect(normalizeScreenContext(undefined)).toBe('catalog');
  });
});

describe('resolveKind', () => {
  it('reads the kind off the intent', () => {
    expect(resolveKind({ intent: 'info_question' })).toBe('service');
    expect(resolveKind({ intent: 'product_recommendation' })).toBe('product');
    expect(resolveKind(null)).toBe('product');
  });
});

describe('isProfileForContext', () => {
  it('treats add-ons as the cart profile', () => {
    expect(isProfileForContext({ code: 'drinks' }, 'product', 'cart')).toBe(true);
    expect(isProfileForContext({ code: 'popular_rolls' }, 'product', 'cart')).toBe(false);
  });

  it('treats service questions as the checkout and empty-screen profile', () => {
    expect(isProfileForContext({ code: 'delivery_cost' }, 'service', 'checkout')).toBe(true);
    expect(isProfileForContext({ code: 'delivery_cost' }, 'service', 'empty')).toBe(true);
    expect(isProfileForContext({ code: 'popular_rolls' }, 'product', 'checkout')).toBe(false);
  });

  it('has no profile in the catalogue', () => {
    expect(isProfileForContext({ code: 'drinks' }, 'product', 'catalog')).toBe(false);
  });
});
