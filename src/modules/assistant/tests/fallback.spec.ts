import { describe, it, expect, beforeEach } from 'vitest';
import { FallbackService } from '../services/fallback.service';

describe('FallbackService', () => {
  let service: FallbackService;

  beforeEach(() => {
    service = new FallbackService();
  });

  it('returns unsupported-intent fallback', () => {
    const result = service.forUnsupportedIntent();
    expect(result.reply_text).toBeTruthy();
    expect(result.cards).toEqual([]);
    expect(result.fallback_used).toBe(true);
  });

  it('returns empty-result fallback with slots info', () => {
    const result = service.forEmptyResult({ budget_max: 1000, category: 'роллы' });
    expect(result.reply_text).toContain('1000');
    expect(result.cards).toEqual([]);
    expect(result.need_clarification).toBe(true);
    expect(result.fallback_used).toBe(true);
  });

  it('returns empty-result fallback without slots', () => {
    const result = service.forEmptyResult({});
    expect(result.reply_text).toBeTruthy();
    expect(result.cards).toEqual([]);
  });

  it('returns invalid-response fallback', () => {
    const result = service.forInvalidResponse();
    expect(result.reply_text).toBeTruthy();
    expect(result.cards).toEqual([]);
    expect(result.fallback_used).toBe(true);
  });

  it('returns LLM-timeout fallback with top candidates', () => {
    const candidates = [
      { product_id: 'p1', name: 'Ролл', price: 500, currency: 'RUB', image_url: null },
    ];
    const result = service.forLLMTimeout(candidates as any);
    expect(result.cards.length).toBeGreaterThan(0);
    expect(result.cards[0].product_id).toBe('p1');
  });

  it('returns suggestion-empty fallback with custom payload', () => {
    const result = service.forSuggestionEmpty({
      reply_text: 'Нет роллов с лососем',
      quick_replies: ['Показать другие'],
    });
    expect(result.reply_text).toBe('Нет роллов с лососем');
  });

  it('returns suggestion-empty fallback with no payload', () => {
    const result = service.forSuggestionEmpty(null);
    expect(result.reply_text).toBeTruthy();
    expect(result.fallback_used).toBe(true);
  });
});

describe('FallbackService — category label in empty result', () => {
  const service = new FallbackService();

  it('prints the catalog display name when the category was resolved', () => {
    const result = service.forEmptyResult({ category: 'roll' }, 'Роллы');

    expect(result.reply_text).toContain('из категории Роллы');
    expect(result.reply_text).not.toContain('roll');
  });

  it('falls back to the raw slot when the category was not resolved', () => {
    const result = service.forEmptyResult({ category: 'roll' });

    expect(result.reply_text).toContain('из категории roll');
  });

  it('mentions no category when the slot is absent', () => {
    const result = service.forEmptyResult({ budget_max: 1000 });

    expect(result.reply_text).not.toContain('из категории');
  });
});
