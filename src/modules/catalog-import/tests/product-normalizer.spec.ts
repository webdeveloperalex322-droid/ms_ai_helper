import { describe, it, expect, beforeEach } from 'vitest';
import { ProductNormalizerService } from '../services/product-normalizer.service';
import { ProductApiResponse } from '../clients/catalog-api.client.interface';

describe('ProductNormalizerService', () => {
  let service: ProductNormalizerService;

  beforeEach(() => {
    service = new ProductNormalizerService();
  });

  function makeRaw(overrides: Partial<ProductApiResponse> = {}): ProductApiResponse {
    return {
      id: 'EXT-001',
      name: 'Ролл Филадельфия',
      categoryId: 'roll',
      categoryName: 'Роллы',
      description: 'Нежный ролл с лососем',
      price: 499,
      oldPrice: 599,
      ingredients: ['лосось', 'сливочный сыр', 'рис'],
      allergens: ['рыба', 'молоко'],
      tags: ['лосось', 'нежный'],
      weight: 250,
      pieces: 8,
      calories: 320,
      protein: 12,
      fat: 14,
      carbs: 38,
      imageUrl: 'https://example.com/img.jpg',
      isAvailable: true,
      ...overrides,
    };
  }

  it('prefers the plain productId (shared identity) over the target-suffixed id', () => {
    const result = service.normalize(
      makeRaw({ id: '34A096F0-F151-11F0-8679-B1F02C7CC614-WEB', productId: '34A096F0-F151-11F0-8679-B1F02C7CC614' }),
      'rn-001',
      'br-001',
      'WEB',
    );
    expect(result.product.externalProductId).toBe('34A096F0-F151-11F0-8679-B1F02C7CC614');
  });

  it('falls back to id when productId is absent', () => {
    const result = service.normalize(makeRaw({ id: 'EXT-001', productId: undefined }), 'rn', 'br', 'WEB');
    expect(result.product.externalProductId).toBe('EXT-001');
  });

  it('normalizes a valid product correctly', () => {
    const result = service.normalize(makeRaw(), 'rn-001', 'br-001', 'WEB');

    expect(result.product.rn).toBe('rn-001');
    expect(result.product.externalProductId).toBe('EXT-001');
    expect(result.product.name).toBe('Ролл Филадельфия');
    expect(result.product.categoryId).toBe('roll');
    expect(result.product.ingredients).toEqual(['лосось', 'сливочный сыр', 'рис']);
    expect(result.product.allergens).toEqual(['рыба', 'молоко']);
    expect(result.product.tags).toEqual(['лосось', 'нежный']);
    expect(result.product.weight).toBe('250');
    expect(result.product.pieces).toBe(8);
    expect(result.product.calories).toBe('320');

    expect(result.cityProduct.rn).toBe('rn-001');
    expect(result.cityProduct.br).toBe('br-001');
    expect(result.cityProduct.target).toBe('WEB');
    expect(result.cityProduct.price).toBe('499');
    expect(result.cityProduct.oldPrice).toBe('599');
    expect(result.cityProduct.currency).toBe('RUB');
    expect(result.cityProduct.isAvailable).toBe(true);
    expect(result.cityProduct.isValid).toBe(true);

    expect(result.isValid).toBe(true);
  });

  it('trims whitespace from name', () => {
    const result = service.normalize(makeRaw({ name: '  Ролл  ' }), 'rn', 'br', 'WEB');
    expect(result.product.name).toBe('Ролл');
  });

  it('marks product invalid when name is missing', () => {
    const result = service.normalize(makeRaw({ name: '' }), 'rn', 'br', 'WEB');
    expect(result.isValid).toBe(false);
    expect(result.cityProduct.isValid).toBe(false);
    expect(result.cityProduct.invalidReason).toBe('missing_name');
  });

  it('marks product invalid when price is missing', () => {
    const result = service.normalize(makeRaw({ price: undefined }), 'rn', 'br', 'WEB');
    expect(result.isValid).toBe(false);
    expect(result.cityProduct.invalidReason).toBe('missing_price');
  });

  it('marks product invalid when price is zero', () => {
    const result = service.normalize(makeRaw({ price: 0 }), 'rn', 'br', 'WEB');
    expect(result.isValid).toBe(false);
    expect(result.cityProduct.invalidReason).toBe('invalid_price');
  });

  it('marks product invalid when price is negative', () => {
    const result = service.normalize(makeRaw({ price: -100 }), 'rn', 'br', 'WEB');
    expect(result.isValid).toBe(false);
  });

  it('handles null/undefined optional fields gracefully', () => {
    const result = service.normalize(
      makeRaw({
        ingredients: undefined,
        allergens: undefined,
        tags: undefined,
        weight: undefined,
        calories: undefined,
        imageUrl: undefined,
      }),
      'rn',
      'br',
      'WEB',
    );
    expect(result.product.ingredients).toBeNull();
    expect(result.product.allergens).toBeNull();
    expect(result.product.tags).toBeNull();
    expect(result.product.weight).toBeNull();
    expect(result.product.calories).toBeNull();
    expect(result.product.imageUrl).toBeNull();
  });

  it('marks product unavailable when isAvailable=false', () => {
    const result = service.normalize(makeRaw({ isAvailable: false }), 'rn', 'br', 'WEB');
    expect(result.cityProduct.isAvailable).toBe(false);
  });

  it('handles string price (coerces to number)', () => {
    const result = service.normalize(makeRaw({ price: '599' as any }), 'rn', 'br', 'WEB');
    expect(result.cityProduct.price).toBe('599');
    expect(result.isValid).toBe(true);
  });

  it('stores raw payload on both product and cityProduct', () => {
    const raw = makeRaw();
    const result = service.normalize(raw, 'rn', 'br', 'WEB');
    expect(result.product.rawPayload).toBe(raw);
    expect(result.cityProduct.rawPayload).toBe(raw);
  });
});
