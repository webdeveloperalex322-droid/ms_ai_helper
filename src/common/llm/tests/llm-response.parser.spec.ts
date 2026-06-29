import { describe, expect, it } from 'vitest';
import { parseIntentResponse, parseRerankResponse } from '../llm-response.parser';

describe('parseIntentResponse', () => {
  it('parses valid intent JSON', () => {
    const result = parseIntentResponse(
      JSON.stringify({
        intent: 'product_recommendation',
        slots: { budget_max: 1500, excluded_ingredients: ['лук'] },
        need_clarification: false,
        clarification_question: null,
        confidence: 0.92,
      }),
    );

    expect(result.intent).toBe('product_recommendation');
    expect(result.slots.budget_max).toBe(1500);
    expect(result.slots.excluded_ingredients).toEqual(['лук']);
    expect(result.confidence).toBe(0.92);
  });

  it('strips markdown code fences', () => {
    const result = parseIntentResponse(
      '```json\n{"intent":"unsupported","slots":{},"need_clarification":false,"confidence":1}\n```',
    );

    expect(result.intent).toBe('unsupported');
  });
});

describe('parseRerankResponse', () => {
  const candidates = [
    { product_id: 'p1', name: 'Филадельфия', price: 500, currency: 'RUB' },
    { product_id: 'p2', name: 'Калифорния', price: 400, currency: 'RUB' },
    { product_id: 'p3', name: 'Дракон', price: 600, currency: 'RUB' },
  ];

  it('keeps only candidates from shortlist', () => {
    const result = parseRerankResponse(
      JSON.stringify({
        selected: [
          { product_id: 'p1', reason: 'с лососем' },
          { product_id: 'unknown', reason: 'не должен попасть' },
        ],
        reply_text: 'Вот подборка',
        quick_replies: ['Дешевле'],
      }),
      candidates,
      5,
    );

    expect(result.selected).toHaveLength(1);
    expect(result.selected[0].product_id).toBe('p1');
    expect(result.reply_text).toBe('Вот подборка');
    expect(result.quick_replies).toEqual(['Дешевле']);
  });

  it('limits selected cards by maxCards', () => {
    const result = parseRerankResponse(
      JSON.stringify({
        selected: [
          { product_id: 'p1', reason: '1' },
          { product_id: 'p2', reason: '2' },
          { product_id: 'p3', reason: '3' },
        ],
        reply_text: 'ok',
      }),
      candidates,
      2,
    );

    expect(result.selected).toHaveLength(2);
  });
});
