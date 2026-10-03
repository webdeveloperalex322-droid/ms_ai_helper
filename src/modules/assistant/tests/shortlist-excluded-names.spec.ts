import { describe, it, expect, vi } from 'vitest';
import { ShortlistBuilderService } from '../services/shortlist-builder.service';
import { IntentResult } from '../providers/llm.provider.interface';

const RN = 'rn-test';
const BR = 'br-test';
const TARGET = 'WEB';

function candidate(id: string, name: string) {
  return {
    product: {
      id,
      name,
      imageUrl: null,
      ingredients: [],
      allergens: [],
      tags: [],
      categoryId: 'CAT-ROLL',
      cityProduct: { price: '499', currency: 'RUB' },
    },
    score: 0.9,
  };
}

function makeBuilder(candidates: any[]) {
  const retriever = { retrieve: vi.fn().mockResolvedValue(candidates) };
  const categoryResolver = {
    resolve: vi.fn().mockResolvedValue({
      categoryIds: ['CAT-ROLL'],
      categoryNames: ['Роллы'],
      labels: ['Роллы'],
      matched: true,
    }),
  };

  return {
    builder: new ShortlistBuilderService(retriever as any, categoryResolver as any),
    retriever,
  };
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

describe('ShortlistBuilderService — excluded product names', () => {
  const candidates = [
    candidate('p-california', 'Калифорния'),
    candidate('p-california-spicy', 'Калифорния спайси'),
    candidate('p-alaska', 'Аляска'),
  ];

  it('drops the exemplar the preset asks to exclude', async () => {
    const { builder } = makeBuilder(candidates);

    const shortlist = await builder.build(
      intent({ category: 'roll', excluded_product_names: ['Калифорния'] }),
      RN,
      BR,
      TARGET,
    );

    expect(shortlist.map((c) => c.product_id)).toEqual(['p-alaska']);
  });

  it('ignores case and surrounding spaces', async () => {
    const { builder } = makeBuilder(candidates);

    const shortlist = await builder.build(
      intent({ category: 'roll', excluded_product_names: ['  КАЛИФОРНИЯ '] }),
      RN,
      BR,
      TARGET,
    );

    expect(shortlist.map((c) => c.product_id)).toEqual(['p-alaska']);
  });

  it('keeps everything when the slot is absent', async () => {
    const { builder } = makeBuilder(candidates);

    const shortlist = await builder.build(intent({ category: 'roll' }), RN, BR, TARGET);

    expect(shortlist).toHaveLength(3);
  });

  it('passes the calorie bound down to the catalogue filters', async () => {
    const { builder, retriever } = makeBuilder(candidates);

    await builder.build(intent({ calories_max: 250 }), RN, BR, TARGET);

    expect(retriever.retrieve.mock.calls[0][0].filters).toMatchObject({ caloriesMax: 250 });
  });
});
