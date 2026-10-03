import { describe, it, expect, vi } from 'vitest';
import { SuggestionEligibilityService } from '../services/suggestion-eligibility.service';

const RN = 'rn-test';
const BR = 'br-test';
const TARGET = 'WEB';

const RULES = { check_products_exist: true, min_products_count: 1 };

function productCandidate(id: string, slots: Record<string, any> = {}) {
  return {
    id,
    payload: { intent: 'product_recommendation', slots },
    availabilityRules: RULES,
  };
}

function serviceCandidate(id: string) {
  return {
    id,
    payload: { intent: 'info_question', slots: {} },
    availabilityRules: RULES,
  };
}

function makeService(
  options: {
    products?: any[];
    resolved?: any;
    resolveError?: Error;
    findError?: Error;
    knowledge?: boolean | Error;
    withoutKnowledge?: boolean;
    hideEmpty?: boolean;
  } = {},
) {
  const catalogService = {
    findByCity: options.findError
      ? vi.fn().mockRejectedValue(options.findError)
      : vi.fn().mockResolvedValue(options.products ?? [{ id: 'p1' }]),
  };

  const categoryResolver = {
    resolve: options.resolveError
      ? vi.fn().mockRejectedValue(options.resolveError)
      : vi
          .fn()
          .mockResolvedValue(
            options.resolved ?? { categoryIds: [], categoryNames: [], labels: [], matched: false },
          ),
  };

  const config = {
    get: vi
      .fn()
      .mockImplementation((key: string) =>
        key === 'HIDE_EMPTY_SUGGESTIONS' ? (options.hideEmpty ?? true) : undefined,
      ),
  };

  const knowledge = options.withoutKnowledge
    ? undefined
    : {
        hasIndexedKnowledge:
          options.knowledge instanceof Error
            ? vi.fn().mockRejectedValue(options.knowledge)
            : vi.fn().mockResolvedValue(options.knowledge ?? true),
      };

  const service = new SuggestionEligibilityService(
    catalogService as any,
    categoryResolver as any,
    config as any,
    knowledge as any,
  );

  return { service, catalogService, categoryResolver, knowledge };
}

describe('SuggestionEligibilityService — product suggestions', () => {
  it('keeps a suggestion whose city has matching products', async () => {
    const { service, categoryResolver, catalogService } = makeService({
      products: [{ id: 'p1' }],
      resolved: {
        categoryIds: ['CAT-ROLL'],
        categoryNames: ['Роллы'],
        labels: ['Роллы'],
        matched: true,
      },
    });

    const eligible = await service.eligibleIds(
      [productCandidate('s1', { category: 'roll' })],
      RN,
      BR,
      TARGET,
    );

    expect(eligible.has('s1')).toBe(true);
    expect(categoryResolver.resolve).toHaveBeenCalledWith(RN, TARGET, 'roll');
    expect(catalogService.findByCity.mock.calls[0][3]).toMatchObject({ categoryIds: ['CAT-ROLL'] });
  });

  it('drops a suggestion whose city has no matching products', async () => {
    const { service } = makeService({ products: [] });

    const eligible = await service.eligibleIds([productCandidate('s1')], RN, BR, TARGET);

    expect(eligible.size).toBe(0);
  });

  it('does not filter by category when the slot resolves to nothing', async () => {
    const { service, catalogService } = makeService({ products: [{ id: 'p1' }] });

    await service.eligibleIds([productCandidate('s1', { category: 'roll' })], RN, BR, TARGET);

    expect(catalogService.findByCity.mock.calls[0][3].categoryIds).toBeUndefined();
  });

  it('keeps the suggestion when the category lookup itself fails', async () => {
    const { service } = makeService({ products: [], resolveError: new Error('db down') });

    const eligible = await service.eligibleIds([productCandidate('s1')], RN, BR, TARGET);

    expect(eligible.has('s1')).toBe(true);
  });

  it('keeps the suggestion when the product query itself fails', async () => {
    const { service } = makeService({ findError: new Error('db down') });

    const eligible = await service.eligibleIds([productCandidate('s1')], RN, BR, TARGET);

    expect(eligible.has('s1')).toBe(true);
  });

  it('skips the check when empty suggestions are not hidden', async () => {
    const { service, catalogService } = makeService({ products: [], hideEmpty: false });

    const eligible = await service.eligibleIds([productCandidate('s1')], RN, BR, TARGET);

    expect(eligible.has('s1')).toBe(true);
    expect(catalogService.findByCity).not.toHaveBeenCalled();
  });

  it('checks many suggestions without one query per suggestion on a repeat call', async () => {
    const { service, catalogService } = makeService({ products: [{ id: 'p1' }] });
    const candidates = Array.from({ length: 20 }, (_, i) => productCandidate(`s${i}`));

    await service.eligibleIds(candidates, RN, BR, TARGET);
    const afterFirst = catalogService.findByCity.mock.calls.length;

    await service.eligibleIds(candidates, RN, BR, TARGET);

    expect(afterFirst).toBe(20);
    expect(catalogService.findByCity.mock.calls.length).toBe(20); // served from cache
  });
});

describe('SuggestionEligibilityService — service suggestions', () => {
  it('keeps service questions when the city has an indexed knowledge base', async () => {
    const { service, catalogService } = makeService({ knowledge: true, products: [] });

    const eligible = await service.eligibleIds([serviceCandidate('s1')], RN, BR, TARGET);

    expect(eligible.has('s1')).toBe(true);
    // The product check must not decide a service question.
    expect(catalogService.findByCity).not.toHaveBeenCalled();
  });

  it('drops service questions when the city has no indexed knowledge base', async () => {
    const { service } = makeService({ knowledge: false });

    const eligible = await service.eligibleIds([serviceCandidate('s1')], RN, BR, TARGET);

    expect(eligible.size).toBe(0);
  });

  it('drops service questions when the knowledge check fails', async () => {
    const { service } = makeService({ knowledge: new Error('db down') });

    const eligible = await service.eligibleIds([serviceCandidate('s1')], RN, BR, TARGET);

    expect(eligible.size).toBe(0);
  });

  it('drops service questions when no knowledge source is wired in', async () => {
    const { service } = makeService({ withoutKnowledge: true });

    const eligible = await service.eligibleIds([serviceCandidate('s1')], RN, BR, TARGET);

    expect(eligible.size).toBe(0);
  });

  it('asks the knowledge base once per city for the whole set', async () => {
    const { service, knowledge } = makeService({ knowledge: true });
    const candidates = Array.from({ length: 8 }, (_, i) => serviceCandidate(`s${i}`));

    await service.eligibleIds(candidates, RN, BR, TARGET);
    await service.eligibleIds(candidates, RN, BR, TARGET);

    expect(knowledge!.hasIndexedKnowledge).toHaveBeenCalledTimes(1);
  });
});
