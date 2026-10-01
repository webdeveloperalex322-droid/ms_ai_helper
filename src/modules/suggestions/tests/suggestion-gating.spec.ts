import { describe, it, expect, vi } from 'vitest';
import { SuggestionService } from '../services/suggestion.service';

const RN = 'rn-test';
const BR = 'br-test';
const TARGET = 'WEB';

const ROLL_SUGGESTION = {
  id: 's1',
  code: 'popular_rolls',
  title: 'Популярные роллы',
  sortOrder: 10,
  screenContext: null,
  activeFrom: null,
  activeTo: null,
  allowedBr: null,
  availabilityRules: { check_products_exist: true, min_products_count: 1 },
  payload: { intent: 'product_recommendation', slots: { category: 'roll' } },
};

function makeDb(rows: any[] = [ROLL_SUGGESTION]) {
  const where = vi.fn().mockResolvedValue(rows);
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { select, from, where };
}

function makeService(options: {
  products?: any[];
  resolved?: any;
  resolveError?: Error;
  rows?: any[];
}) {
  const db = makeDb(options.rows);
  const catalogService = { findByCity: vi.fn().mockResolvedValue(options.products ?? []) };
  const categoryResolver = {
    resolve: options.resolveError
      ? vi.fn().mockRejectedValue(options.resolveError)
      : vi
          .fn()
          .mockResolvedValue(options.resolved ?? { categoryIds: [], labels: [], matched: false }),
  };
  const config = { get: vi.fn().mockReturnValue(undefined) };

  const service = new SuggestionService(
    db as any,
    catalogService as any,
    config as any,
    categoryResolver as any,
  );

  return { service, catalogService, categoryResolver };
}

describe('SuggestionService — category gating', () => {
  it('keeps a legacy-slug suggestion when the resolved category has products', async () => {
    const { service, catalogService, categoryResolver } = makeService({
      products: [{ id: 'p1' }],
      resolved: { categoryIds: ['CAT-ROLL'], labels: ['Роллы'], matched: true },
    });

    const result = await service.getActiveSuggestions(RN, BR, TARGET);

    expect(categoryResolver.resolve).toHaveBeenCalledWith(RN, TARGET, 'roll');
    expect(catalogService.findByCity.mock.calls[0][3]).toMatchObject({
      categoryIds: ['CAT-ROLL'],
    });
    expect(result.map((s) => s.code)).toEqual(['popular_rolls']);
  });

  it('hides the suggestion when the resolved category has no products', async () => {
    const { service } = makeService({
      products: [],
      resolved: { categoryIds: ['CAT-ROLL'], labels: ['Роллы'], matched: true },
    });

    const result = await service.getActiveSuggestions(RN, BR, TARGET);

    expect(result).toEqual([]);
  });

  it('does not filter by category when the slot resolves to nothing', async () => {
    const { service, catalogService } = makeService({ products: [{ id: 'p1' }] });

    await service.getActiveSuggestions(RN, BR, TARGET);

    expect(catalogService.findByCity.mock.calls[0][3].categoryIds).toBeUndefined();
  });

  it('shows the suggestion when the category lookup itself fails', async () => {
    const { service } = makeService({
      products: [],
      resolveError: new Error('db down'),
    });

    const result = await service.getActiveSuggestions(RN, BR, TARGET);

    expect(result.map((s) => s.code)).toEqual(['popular_rolls']);
  });
});
