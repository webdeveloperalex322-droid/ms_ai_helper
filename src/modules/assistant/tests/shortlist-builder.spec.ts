import { describe, it, expect, vi } from 'vitest';
import { ShortlistBuilderService } from '../services/shortlist-builder.service';
import { IntentResult } from '../providers/llm.provider.interface';

const RN = 'rn-test';
const BR = 'br-test';
const TARGET = 'WEB';

function makeIntent(slots: Partial<IntentResult['slots']> = {}): IntentResult {
  return {
    intent: 'product_recommendation',
    slots: slots as IntentResult['slots'],
    need_clarification: false,
    clarification_question: null,
    confidence: 0.9,
  };
}

function makeService(resolved: any = { categoryIds: [], labels: [], matched: false }) {
  const hybridRetriever = { retrieve: vi.fn().mockResolvedValue([]) };
  const categoryResolver = { resolve: vi.fn().mockResolvedValue(resolved) };
  const service = new ShortlistBuilderService(hybridRetriever as any, categoryResolver as any);
  return { service, hybridRetriever, categoryResolver };
}

describe('ShortlistBuilderService — category resolution', () => {
  it('passes resolved category ids to the retriever instead of the raw slot', async () => {
    const { service, hybridRetriever, categoryResolver } = makeService({
      categoryIds: ['CAT-ROLL', 'CAT-ROLL-PREMIUM'],
      labels: ['Роллы', 'Премиальные роллы'],
      matched: true,
    });

    await service.build(makeIntent({ category: 'roll' }), RN, BR, TARGET);

    expect(categoryResolver.resolve).toHaveBeenCalledWith(RN, TARGET, 'roll');
    expect(hybridRetriever.retrieve.mock.calls[0][0].filters).toMatchObject({
      categoryIds: ['CAT-ROLL', 'CAT-ROLL-PREMIUM'],
    });
  });

  it('drops the category filter when the slot matches no catalog category', async () => {
    const { service, hybridRetriever } = makeService();

    await service.build(makeIntent({ category: 'фывапролдж' }), RN, BR, TARGET);

    const filters = hybridRetriever.retrieve.mock.calls[0][0].filters;
    expect(filters.categoryIds).toBeUndefined();
  });

  it('does not resolve anything when the slot is absent', async () => {
    const { service, categoryResolver, hybridRetriever } = makeService();

    await service.build(makeIntent({ budget_max: 500 }), RN, BR, TARGET);

    expect(categoryResolver.resolve).not.toHaveBeenCalled();
    expect(hybridRetriever.retrieve.mock.calls[0][0].filters.categoryIds).toBeUndefined();
  });

  it('keeps the other slots in the filters', async () => {
    const { service, hybridRetriever } = makeService({
      categoryIds: ['CAT-ROLL'],
      labels: ['Роллы'],
      matched: true,
    });

    await service.build(
      makeIntent({
        category: 'roll',
        budget_max: 500,
        preferred_ingredients: ['лосось'],
        excluded_ingredients: ['креветка'],
        spicy: false,
      }),
      RN,
      BR,
      TARGET,
    );

    expect(hybridRetriever.retrieve.mock.calls[0][0].filters).toMatchObject({
      categoryIds: ['CAT-ROLL'],
      budgetMax: 500,
      preferredIngredients: ['лосось'],
      excludedIngredients: ['креветка'],
      spicy: false,
      isAvailable: true,
    });
  });

  it('still sends the category word in the retrieval query when it did not resolve', async () => {
    const { service, hybridRetriever } = makeService();

    await service.build(makeIntent({ category: 'роллы' }), RN, BR, TARGET);

    expect(hybridRetriever.retrieve.mock.calls[0][0].query).toContain('роллы');
  });

  it('exposes the resolved labels for user-facing texts', async () => {
    const { service } = makeService({
      categoryIds: ['CAT-ROLL'],
      labels: ['Роллы'],
      matched: true,
    });

    const result = await service.buildWithContext(makeIntent({ category: 'roll' }), RN, BR, TARGET);

    expect(result.categoryLabel).toBe('Роллы');
    expect(result.candidates).toEqual([]);
  });
});
