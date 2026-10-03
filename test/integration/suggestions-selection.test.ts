import { describe, it, expect, vi } from 'vitest';
import { CatalogService } from '@/modules/catalog/services/catalog.service';
import { CategoryResolverService } from '@/modules/catalog/services/category-resolver.service';
import { SuggestionService } from '@/modules/suggestions/services/suggestion.service';
import { SuggestionSelectorService } from '@/modules/suggestions/services/suggestion-selector.service';
import { SuggestionEligibilityService } from '@/modules/suggestions/services/suggestion-eligibility.service';
import { DayPartService } from '@/modules/suggestions/services/day-part.service';
import { SuggestionStatsService } from '@/modules/suggestions/services/suggestion-stats.service';
import { CART_ADDON_CODES } from '@/modules/suggestions/services/suggestion-context';

const RN = 'rn-prod';
const BR = 'br-prod';
const OTHER_BR = 'br-other';
const TARGET = 'WEB';

const DEFAULT_RULES = {
  check_products_exist: true,
  min_products_count: 1,
  hide_if_empty: true,
  respect_city_availability: true,
};

interface RowOverrides {
  code: string;
  sortOrder?: number;
  intent?: string;
  slots?: Record<string, any>;
  screenContexts?: string[] | null;
  screenContext?: string | null;
  allowedBr?: string[] | null;
  activeFrom?: Date | null;
  activeTo?: Date | null;
  enabled?: boolean;
}

function row(overrides: RowOverrides) {
  return {
    id: `id-${overrides.code}`,
    rn: RN,
    code: overrides.code,
    title: overrides.code,
    emoji: null,
    enabled: overrides.enabled ?? true,
    sortOrder: overrides.sortOrder ?? 100,
    screenContext: overrides.screenContext ?? null,
    screenContexts: overrides.screenContexts ?? ['catalog'],
    target: TARGET,
    activeFrom: overrides.activeFrom ?? null,
    activeTo: overrides.activeTo ?? null,
    allowedBr: overrides.allowedBr ?? null,
    payload: {
      intent: overrides.intent ?? 'product_recommendation',
      slots: overrides.slots ?? {},
      retrieval_query: overrides.code,
    },
    availabilityRules: DEFAULT_RULES,
    fallbackPayload: { reply_text: 'fallback', quick_replies: [] },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const PRODUCT_ROWS = Array.from({ length: 20 }, (_, i) =>
  row({ code: `p${i}`, sortOrder: 10 + i * 10 }),
);

const SERVICE_ROWS = Array.from({ length: 6 }, (_, i) =>
  row({
    code: `svc${i}`,
    sortOrder: 300 + i * 10,
    intent: 'info_question',
    screenContexts: ['catalog', 'checkout', 'empty'],
  }),
);

const ADDON_ROWS = CART_ADDON_CODES.map((code, i) =>
  row({ code, sortOrder: 200 + i * 10, screenContexts: ['catalog', 'cart'] }),
);

/**
 * Suggestion rows live behind select().from().where(); the statistics query
 * adds groupBy() on the same chain, so one stand-in serves both.
 */
function makeSuggestionsDb(rows: any[], statsRows: any[] = []) {
  // Awaiting where() yields the suggestion rows; calling groupBy() on it yields
  // the statistics rows — the two shapes drizzle produces on this chain.
  const whereResult = {
    then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
    groupBy: async () => statsRows,
  };

  return {
    select: () => ({ from: () => ({ where: () => whereResult }) }),
  };
}

/** Catalogue stand-in: every product query matches unless told otherwise. */
function makeCatalogDb(products: any[]) {
  return {
    select: () => ({
      from: () => ({
        where: async () => [],
        innerJoin: () => ({ innerJoin: () => ({ where: async () => products }) }),
      }),
    }),
  };
}

function makeService(
  options: {
    rows?: any[];
    products?: any[];
    knowledge?: boolean;
    limit?: number;
    stats?: Array<{ suggestionId: string; shown: string; clicked: string }>;
  } = {},
) {
  const catalogDb = makeCatalogDb(
    options.products ?? [
      {
        products: {
          id: 'p-1',
          name: 'Филадельфия',
          categoryId: 'CAT-ROLL',
          categoryName: 'Роллы',
          ingredients: ['лосось'],
          allergens: null,
          tags: null,
          imageUrl: null,
        },
        city_products: { price: '499', currency: 'RUB', isAvailable: true },
      },
    ],
  );

  const config = {
    get: vi.fn().mockImplementation((key: string) => {
      if (key === 'MAX_SUGGESTIONS_ON_SCREEN') return options.limit ?? 6;
      if (key === 'HIDE_EMPTY_SUGGESTIONS') return true;
      if (key === 'SUGGESTIONS_SERVICE_QUOTA_MIN') return 1;
      if (key === 'SUGGESTIONS_SERVICE_QUOTA_MAX') return 2;
      if (key === 'SUGGESTIONS_CONTEXT_BOOST') return 2;
      if (key === 'SUGGESTIONS_EXPLORATION_BONUS') return 0.15;
      return undefined;
    }),
  };

  const eligibility = new SuggestionEligibilityService(
    new CatalogService(catalogDb as any) as any,
    new CategoryResolverService(catalogDb as any) as any,
    config as any,
    { hasIndexedKnowledge: vi.fn().mockResolvedValue(options.knowledge ?? true) } as any,
  );

  const db = makeSuggestionsDb(
    options.rows ?? [...PRODUCT_ROWS, ...SERVICE_ROWS],
    options.stats ?? [],
  );

  return new SuggestionService(
    db as any,
    config as any,
    eligibility,
    new SuggestionSelectorService(config as any),
    new DayPartService(config as any),
    new SuggestionStatsService(db as any, config as any),
  );
}

describe('suggestion set — size, uniqueness, emptiness', () => {
  it('returns the configured limit instead of the whole catalogue', async () => {
    const service = makeService();

    const result = await service.getActiveSuggestions(RN, BR, TARGET, 'catalog', {
      sessionId: 'visit-1',
    });

    expect(result).toHaveLength(6);
  });

  it('returns no duplicates', async () => {
    const service = makeService();

    for (let i = 0; i < 20; i++) {
      const result = await service.getActiveSuggestions(RN, BR, TARGET, 'catalog', {
        sessionId: `visit-${i}`,
      });
      expect(new Set(result.map((r) => r.id)).size).toBe(result.length);
    }
  });

  it('returns an empty list, not an error, when nothing is eligible', async () => {
    const service = makeService({ products: [], knowledge: false });

    const result = await service.getActiveSuggestions(RN, BR, TARGET, 'catalog', {
      sessionId: 'visit-1',
    });

    expect(result).toEqual([]);
  });

  it('marks each item with its kind', async () => {
    const service = makeService();

    const result = await service.getActiveSuggestions(RN, BR, TARGET, 'catalog', {
      sessionId: 'visit-1',
    });

    expect(result.every((r) => r.kind === 'product' || r.kind === 'service')).toBe(true);
    expect(result.some((r) => r.kind === 'service')).toBe(true);
  });
});

describe('suggestion set — service questions', () => {
  it('offers one or two service questions in a city with an indexed knowledge base', async () => {
    const service = makeService({ knowledge: true });

    for (let i = 0; i < 20; i++) {
      const result = await service.getActiveSuggestions(RN, BR, TARGET, 'catalog', {
        sessionId: `visit-${i}`,
      });
      const services = result.filter((r) => r.kind === 'service').length;

      expect(services).toBeGreaterThanOrEqual(1);
      expect(services).toBeLessThanOrEqual(2);
    }
  });

  it('hides service questions in a city without an indexed knowledge base and fills with products', async () => {
    const service = makeService({ knowledge: false });

    const result = await service.getActiveSuggestions(RN, BR, TARGET, 'catalog', {
      sessionId: 'visit-1',
    });

    expect(result).toHaveLength(6);
    expect(result.every((r) => r.kind === 'product')).toBe(true);
  });

  it('keeps service questions out of the product availability check', async () => {
    // No products in the city at all: only service questions may survive.
    const service = makeService({ products: [], knowledge: true });

    const result = await service.getActiveSuggestions(RN, BR, TARGET, 'catalog', {
      sessionId: 'visit-1',
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((r) => r.kind === 'service')).toBe(true);
  });
});

describe('suggestion set — stability and rotation', () => {
  it('is stable for the same session id', async () => {
    const service = makeService();

    const first = await service.getActiveSuggestions(RN, BR, TARGET, 'catalog', {
      sessionId: 'visit-1',
    });
    const second = await service.getActiveSuggestions(RN, BR, TARGET, 'catalog', {
      sessionId: 'visit-1',
    });

    expect(first.map((r) => r.code)).toEqual(second.map((r) => r.code));
  });

  it('rotates between session ids', async () => {
    const service = makeService();

    const first = await service.getActiveSuggestions(RN, BR, TARGET, 'catalog', {
      sessionId: 'visit-1',
    });
    const second = await service.getActiveSuggestions(RN, BR, TARGET, 'catalog', {
      sessionId: 'visit-2',
    });

    expect(first.map((r) => r.code)).not.toEqual(second.map((r) => r.code));
  });

  it('covers most of the catalogue over a day of visits', async () => {
    const service = makeService();
    const seen = new Set<string>();

    for (let i = 0; i < 60; i++) {
      const result = await service.getActiveSuggestions(RN, BR, TARGET, 'catalog', {
        sessionId: `visit-${i}`,
      });
      result.forEach((r) => seen.add(r.code));
    }

    expect(seen.size / (PRODUCT_ROWS.length + SERVICE_ROWS.length)).toBeGreaterThanOrEqual(0.7);
  });
});

describe('suggestion set — screen context', () => {
  const rows = [...PRODUCT_ROWS, ...SERVICE_ROWS, ...ADDON_ROWS];

  it('fills the cart mostly with add-ons', async () => {
    const service = makeService({ rows });

    const result = await service.getActiveSuggestions(RN, BR, TARGET, 'cart', {
      sessionId: 'visit-1',
    });

    const addons = result.filter((r) =>
      (CART_ADDON_CODES as readonly string[]).includes(r.code),
    ).length;

    expect(addons).toBeGreaterThanOrEqual(4);
  });

  it('fills the checkout mostly with service questions', async () => {
    const service = makeService({ rows });

    const result = await service.getActiveSuggestions(RN, BR, TARGET, 'checkout', {
      sessionId: 'visit-1',
    });

    expect(result.filter((r) => r.kind === 'service').length).toBeGreaterThanOrEqual(4);
  });

  it('treats an unknown context as the catalogue', async () => {
    const service = makeService({ rows });

    const unknown = await service.getActiveSuggestions(RN, BR, TARGET, 'nonsense', {
      sessionId: 'visit-1',
    });
    const catalog = await service.getActiveSuggestions(RN, BR, TARGET, 'catalog', {
      sessionId: 'visit-1',
    });

    expect(unknown.map((r) => r.code)).toEqual(catalog.map((r) => r.code));
  });

  it('keeps a catalogue-only suggestion out of the cart', async () => {
    const service = makeService({ rows });

    const result = await service.getActiveSuggestions(RN, BR, TARGET, 'cart', {
      sessionId: 'visit-1',
    });

    expect(result.map((r) => r.code)).not.toContain('p0');
  });
});

describe('suggestion set — accumulated statistics', () => {
  /** How often a code lands in the set over many visits. */
  async function hitRate(service: ReturnType<typeof makeService>, code: string) {
    let hits = 0;

    for (let i = 0; i < 60; i++) {
      const result = await service.getActiveSuggestions(RN, BR, TARGET, 'catalog', {
        sessionId: `visit-${i}`,
      });
      if (result.some((r) => r.code === code)) hits++;
    }

    return hits;
  }

  it('orders by what the admin set when no events exist', async () => {
    const service = makeService({ rows: PRODUCT_ROWS.slice(0, 6), stats: [] });

    const result = await service.getActiveSuggestions(RN, BR, TARGET, 'catalog', {
      sessionId: 'visit-1',
    });

    expect(result.map((r) => r.sort_order)).toEqual([10, 20, 30, 40, 50, 60]);
  });

  it('shows a suggestion with a trusted high click share more often', async () => {
    const worst = PRODUCT_ROWS[PRODUCT_ROWS.length - 1];

    const baseline = await hitRate(makeService({ limit: 3 }), worst.code);
    const boosted = await hitRate(
      makeService({
        limit: 3,
        stats: [{ suggestionId: worst.id, shown: '500', clicked: '400' }],
      }),
      worst.code,
    );

    expect(boosted).toBeGreaterThan(baseline);
  });

  it('ignores a click share gathered on too few impressions', async () => {
    const worst = PRODUCT_ROWS[PRODUCT_ROWS.length - 1];

    const baseline = await hitRate(makeService({ limit: 3 }), worst.code);
    const noisy = await hitRate(
      makeService({
        limit: 3,
        stats: [{ suggestionId: worst.id, shown: '5', clicked: '5' }],
      }),
      worst.code,
    );

    expect(noisy).toBe(baseline);
  });
});

describe('suggestion set — hard filters', () => {
  it('hides a suggestion limited to another city', async () => {
    const service = makeService({
      rows: [
        ...PRODUCT_ROWS.slice(0, 3),
        row({ code: 'city_promo', sortOrder: 1, allowedBr: [OTHER_BR] }),
      ],
    });

    const result = await service.getActiveSuggestions(RN, BR, TARGET, 'catalog', {
      sessionId: 'visit-1',
    });

    expect(result.map((r) => r.code)).not.toContain('city_promo');
  });

  it('hides a suggestion outside its active window', async () => {
    const past = new Date(Date.now() - 86_400_000);
    const service = makeService({
      rows: [
        ...PRODUCT_ROWS.slice(0, 3),
        row({ code: 'expired', sortOrder: 1, activeTo: past }),
        row({ code: 'future', sortOrder: 1, activeFrom: new Date(Date.now() + 86_400_000) }),
      ],
    });

    const codes = (
      await service.getActiveSuggestions(RN, BR, TARGET, 'catalog', { sessionId: 'visit-1' })
    ).map((r) => r.code);

    expect(codes).not.toContain('expired');
    expect(codes).not.toContain('future');
  });

  it('hides a product suggestion the city has no products for', async () => {
    const service = makeService({ products: [], rows: PRODUCT_ROWS.slice(0, 5) });

    const result = await service.getActiveSuggestions(RN, BR, TARGET, 'catalog', {
      sessionId: 'visit-1',
    });

    expect(result).toEqual([]);
  });
});
