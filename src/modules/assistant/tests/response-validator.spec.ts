import { describe, it, expect, vi } from 'vitest';
import { ResponseValidatorService } from '../services/response-validator.service';

function makeContext(overrides: Partial<any> = {}): any {
  return {
    rn: 'sushimaster',
    br: 'test_city',
    target: 'WEB',
    slots: {},
    shortlistIds: ['p1', 'p2'],
    bannedPhrases: ['придумал'],
    maxCards: 5,
    ...overrides,
  };
}

function makeCatalogService(product: any = null) {
  return {
    findById: vi.fn().mockResolvedValue(product),
  } as any;
}

describe('ResponseValidatorService', () => {
  it('passes a valid response when product is in shortlist and available', async () => {
    const product = {
      cityProduct: {
        isAvailable: true,
        isValid: true,
        price: '500',
        br: 'test_city',
        target: 'WEB',
      },
      ingredients: [],
      allergens: [],
      tags: [],
    };
    const catalogService = makeCatalogService(product);
    const validator = new ResponseValidatorService(catalogService);

    const result = await validator.validate(
      { selected: [{ product_id: 'p1', reason: 'вкусно' }], reply_text: 'Вот подходящие роллы' },
      makeContext({ shortlistIds: ['p1'] }),
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when card product is not in shortlist', async () => {
    const validator = new ResponseValidatorService(makeCatalogService());
    const result = await validator.validate(
      { selected: [{ product_id: 'ghost', reason: 'test' }], reply_text: 'Товар' },
      makeContext({ shortlistIds: ['p1'] }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'NOT_IN_SHORTLIST')).toBe(true);
  });

  it('fails when product is unavailable', async () => {
    const product = {
      cityProduct: {
        isAvailable: false,
        isValid: true,
        price: '500',
        br: 'test_city',
        target: 'WEB',
      },
      ingredients: [],
      allergens: [],
      tags: [],
    };
    const validator = new ResponseValidatorService(makeCatalogService(product));
    const result = await validator.validate(
      { selected: [{ product_id: 'p1', reason: 'test' }], reply_text: 'Товар' },
      makeContext({ shortlistIds: ['p1'] }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'PRODUCT_UNAVAILABLE')).toBe(true);
  });

  it('fails when price exceeds budget', async () => {
    const product = {
      cityProduct: {
        isAvailable: true,
        isValid: true,
        price: '2000',
        br: 'test_city',
        target: 'WEB',
      },
      ingredients: [],
      allergens: [],
      tags: [],
    };
    const validator = new ResponseValidatorService(makeCatalogService(product));
    const result = await validator.validate(
      { selected: [{ product_id: 'p1', reason: 'test' }], reply_text: 'Товар' },
      makeContext({ shortlistIds: ['p1'], slots: { budget_max: 1000 } }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'BUDGET_EXCEEDED')).toBe(true);
  });

  it('fails when reply text contains banned phrase', async () => {
    const validator = new ResponseValidatorService(makeCatalogService());
    const result = await validator.validate(
      { selected: [], reply_text: 'Я придумал этот товар для вас' },
      makeContext({ bannedPhrases: ['придумал'] }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'BANNED_PHRASE')).toBe(true);
  });

  it('fails when reply text contains allergy safety claim', async () => {
    const validator = new ResponseValidatorService(makeCatalogService());
    const result = await validator.validate(
      { selected: [], reply_text: 'Этот продукт 100% безопасно для вас' },
      makeContext(),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'ALLERGY_SAFETY_CLAIM')).toBe(true);
  });
});
