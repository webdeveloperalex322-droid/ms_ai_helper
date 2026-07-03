import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProductNormalizerService } from '../services/product-normalizer.service';
import { ProductApiResponse } from '../clients/catalog-api.client.interface';

const realSample: ProductApiResponse = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'real-product.sample.json'), 'utf8'),
);

describe('ProductNormalizerService', () => {
  let service: ProductNormalizerService;

  beforeEach(() => {
    service = new ProductNormalizerService();
  });

  /** A nested, real-API-shaped product with sensible defaults; override any node. */
  function makeRaw(overrides: Partial<ProductApiResponse> = {}): ProductApiResponse {
    return {
      id: 'EXT-001',
      name: 'Ролл Филадельфия',
      categoryId: 'roll',
      mainCategotyId: 'CAT-ROLL',
      productDescription: 'Нежный ролл с лососем',
      price: 499,
      oldPrice: 599,
      imageUrl: 'https://example.com/img.jpg',
      isAvailable: true,
      localization: [
        { language: 'ru', name: 'Ролл Филадельфия', productDescription: 'Нежный ролл с лососем' },
      ],
      classifiers: [
        {
          categoryId: 'CAT-ROLL',
          name: 'Роллы',
          localization: [{ language: 'ru', name: 'Роллы' }],
        },
      ],
      additionalProperties: {
        pieces: 8,
        nutritional: {
          calorie: 320,
          proteins: 12,
          fat: 14,
          carbohydrates: 38,
          weight: 250,
          composition: { value: 'лосось, сливочный сыр, рис' },
        },
      },
      ...overrides,
    };
  }

  it('prefers the plain productId (shared identity) over the target-suffixed id', () => {
    const result = service.normalize(
      makeRaw({
        id: '34A096F0-F151-11F0-8679-B1F02C7CC614-WEB',
        productId: '34A096F0-F151-11F0-8679-B1F02C7CC614',
      }),
      'rn-001',
      'br-001',
      'WEB',
    );
    expect(result.product.externalProductId).toBe('34A096F0-F151-11F0-8679-B1F02C7CC614');
  });

  it('falls back to id when productId is absent', () => {
    const result = service.normalize(
      makeRaw({ id: 'EXT-001', productId: undefined }),
      'rn',
      'br',
      'WEB',
    );
    expect(result.product.externalProductId).toBe('EXT-001');
  });

  it('normalizes a valid product correctly (nested paths)', () => {
    const result = service.normalize(makeRaw(), 'rn-001', 'br-001', 'WEB');

    expect(result.product.rn).toBe('rn-001');
    expect(result.product.externalProductId).toBe('EXT-001');
    expect(result.product.name).toBe('Ролл Филадельфия');
    expect(result.product.categoryId).toBe('roll');
    expect(result.product.categoryName).toBe('Роллы');
    expect(result.product.description).toBe('Нежный ролл с лососем');
    expect(result.product.ingredients).toEqual(['лосось', 'сливочный сыр', 'рис']);
    expect(result.product.weight).toBe('250');
    expect(result.product.pieces).toBe(8);
    expect(result.product.calories).toBe('320');
    expect(result.product.protein).toBe('12');
    expect(result.product.fat).toBe('14');
    expect(result.product.carbs).toBe('38');

    // allergens/tags have no source field in the API → always null
    expect(result.product.allergens).toBeNull();
    expect(result.product.tags).toBeNull();

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

  it('prefers the localized (ru) name over the top-level name', () => {
    const result = service.normalize(
      makeRaw({
        name: 'top-level fallback',
        localization: [{ language: 'ru', name: '  Ролл ru  ' }],
      }),
      'rn',
      'br',
      'WEB',
    );
    expect(result.product.name).toBe('Ролл ru');
  });

  it('falls back to top-level name when no localization present', () => {
    const result = service.normalize(
      makeRaw({ name: '  Ролл  ', localization: undefined }),
      'rn',
      'br',
      'WEB',
    );
    expect(result.product.name).toBe('Ролл');
  });

  it('uses localization[0] when no ru entry exists', () => {
    const result = service.normalize(
      makeRaw({ name: 'top', localization: [{ language: 'en', name: 'Roll EN' }] }),
      'rn',
      'br',
      'WEB',
    );
    expect(result.product.name).toBe('Roll EN');
  });

  describe('categoryName resolution', () => {
    it('resolves from the classifier matching mainCategotyId', () => {
      const result = service.normalize(
        makeRaw({
          mainCategotyId: 'CAT-B',
          classifiers: [
            { categoryId: 'CAT-A', localization: [{ language: 'ru', name: 'Новинки' }] },
            { categoryId: 'CAT-B', localization: [{ language: 'ru', name: 'Роллы и суши' }] },
          ],
        }),
        'rn',
        'br',
        'WEB',
      );
      expect(result.product.categoryName).toBe('Роллы и суши');
    });

    it('falls back to the first classifier when none match mainCategotyId', () => {
      const result = service.normalize(
        makeRaw({
          mainCategotyId: 'NO-MATCH',
          classifiers: [
            { categoryId: 'CAT-A', name: 'Первая' },
            { categoryId: 'CAT-B', name: 'Вторая' },
          ],
        }),
        'rn',
        'br',
        'WEB',
      );
      expect(result.product.categoryName).toBe('Первая');
    });

    it('is null when classifiers is empty or absent', () => {
      expect(
        service.normalize(makeRaw({ classifiers: [] }), 'rn', 'br', 'WEB').product.categoryName,
      ).toBeNull();
      expect(
        service.normalize(makeRaw({ classifiers: undefined }), 'rn', 'br', 'WEB').product
          .categoryName,
      ).toBeNull();
    });
  });

  describe('description resolution', () => {
    it('prefers top-level productDescription', () => {
      const result = service.normalize(
        makeRaw({
          productDescription: 'top desc',
          localization: [{ language: 'ru', productDescription: 'loc desc' }],
        }),
        'rn',
        'br',
        'WEB',
      );
      expect(result.product.description).toBe('top desc');
    });

    it('falls back to localized productDescription', () => {
      const result = service.normalize(
        makeRaw({
          productDescription: '',
          localization: [{ language: 'ru', productDescription: 'loc desc' }],
        }),
        'rn',
        'br',
        'WEB',
      );
      expect(result.product.description).toBe('loc desc');
    });

    it('is null when both are empty', () => {
      const result = service.normalize(
        makeRaw({ productDescription: '   ', localization: [{ language: 'ru' }] }),
        'rn',
        'br',
        'WEB',
      );
      expect(result.product.description).toBeNull();
    });
  });

  describe('ingredients parsing', () => {
    it('splits the comma-separated composition string', () => {
      const result = service.normalize(makeRaw(), 'rn', 'br', 'WEB');
      expect(result.product.ingredients).toEqual(['лосось', 'сливочный сыр', 'рис']);
    });

    it('trims entries and drops empties', () => {
      const result = service.normalize(
        withComposition(makeRaw(), '  лосось ,, рис ,  '),
        'rn',
        'br',
        'WEB',
      );
      expect(result.product.ingredients).toEqual(['лосось', 'рис']);
    });

    it('is null when composition is empty or absent', () => {
      expect(
        service.normalize(withComposition(makeRaw(), ''), 'rn', 'br', 'WEB').product.ingredients,
      ).toBeNull();
      expect(
        service.normalize(makeRaw({ additionalProperties: { pieces: 1 } }), 'rn', 'br', 'WEB')
          .product.ingredients,
      ).toBeNull();
    });
  });

  describe('robustness (FR-008)', () => {
    it('handles a product with no additionalProperties without throwing', () => {
      const result = service.normalize(
        makeRaw({ additionalProperties: undefined }),
        'rn',
        'br',
        'WEB',
      );
      expect(result.product.calories).toBeNull();
      expect(result.product.protein).toBeNull();
      expect(result.product.fat).toBeNull();
      expect(result.product.carbs).toBeNull();
      expect(result.product.weight).toBeNull();
      expect(result.product.pieces).toBeNull();
      expect(result.product.ingredients).toBeNull();
      // validity still decided by name + price
      expect(result.isValid).toBe(true);
    });

    it('marks product invalid when name is missing', () => {
      const result = service.normalize(
        makeRaw({ name: '', localization: undefined }),
        'rn',
        'br',
        'WEB',
      );
      expect(result.isValid).toBe(false);
      expect(result.cityProduct.invalidReason).toBe('missing_name');
    });

    it('marks product invalid when price is missing/zero/negative', () => {
      expect(
        service.normalize(makeRaw({ price: undefined }), 'rn', 'br', 'WEB').cityProduct
          .invalidReason,
      ).toBe('missing_price');
      expect(
        service.normalize(makeRaw({ price: 0 }), 'rn', 'br', 'WEB').cityProduct.invalidReason,
      ).toBe('invalid_price');
      expect(service.normalize(makeRaw({ price: -100 }), 'rn', 'br', 'WEB').isValid).toBe(false);
    });

    it('marks product unavailable when isAvailable=false', () => {
      expect(
        service.normalize(makeRaw({ isAvailable: false }), 'rn', 'br', 'WEB').cityProduct
          .isAvailable,
      ).toBe(false);
    });

    it('stores the full nested raw payload on both product and cityProduct', () => {
      const raw = makeRaw();
      const result = service.normalize(raw, 'rn', 'br', 'WEB');
      expect(result.product.rawPayload).toBe(raw);
      expect(result.cityProduct.rawPayload).toBe(raw);
    });
  });

  // Regression guard: full-contract assertions against the real API payload sample.
  describe('real payload fixture (regression guard for shape drift)', () => {
    it('maps every target field per the normalizer contract', () => {
      const { product, cityProduct, isValid } = service.normalize(
        realSample,
        'rn-x',
        'br-x',
        'WEB',
      );

      expect(product.externalProductId).toBe('61383050-F152-11F0-8679-B1F02C7CC614');
      expect(product.name).toBe('Ролл Чесночный драйв запеченный');
      expect(product.categoryId).toBe('620E38C0-4149-11EC-B578-65989D437D8E');
      expect(product.categoryName).toBe('Роллы и суши');
      expect(product.description).toBeTruthy();
      expect(product.description!.length).toBeGreaterThan(0);
      expect(product.ingredients).toEqual([
        'Крем сыр',
        'курица',
        'огурец',
        'лук фри',
        'чесночный соус',
        'снаги соус',
        'кунжут',
        'рис',
        'нори',
      ]);
      expect(product.weight).toBe('250');
      expect(product.pieces).toBe(0);
      expect(product.calories).toBe('260');
      expect(product.protein).toBe('5.9');
      expect(product.fat).toBe('10.4');
      expect(product.carbs).toBe('35.8');
      expect(product.imageUrl).toContain('firebasestorage');
      expect(product.rawPayload).toBe(realSample);

      expect(cityProduct.price).toBe('259');
      expect(cityProduct.oldPrice).toBe('0');
      expect(isValid).toBe(true);
    });

    it('has no mojibake in the decoded fixture (Cyrillic intact)', () => {
      expect(realSample.name).not.toContain('Ð');
      expect(realSample.name).toMatch(/[а-яА-Я]/);
    });
  });

  describe('attributes extraction', () => {
    it('maps attributes array into id+name pairs', () => {
      const result = service.normalize(
        makeRaw({
          attributes: [
            { id: 'a-001', name: '8 шт.' },
            { id: 'a-002', name: 'Острый' },
          ],
        }),
        'rn',
        'br',
        'WEB',
      );
      expect(result.product.attributes).toEqual([
        { id: 'a-001', name: '8 шт.' },
        { id: 'a-002', name: 'Острый' },
      ]);
    });

    it('returns empty array when attributes absent', () => {
      const result = service.normalize(makeRaw({ attributes: undefined }), 'rn', 'br', 'WEB');
      expect(result.product.attributes).toEqual([]);
    });

    it('filters out entries missing id or name', () => {
      const result = service.normalize(
        makeRaw({ attributes: [{ id: 'a-001', name: 'Ок' }, { id: 'no-name' } as any] }),
        'rn',
        'br',
        'WEB',
      );
      expect(result.product.attributes).toHaveLength(1);
      expect(result.product.attributes![0].id).toBe('a-001');
    });
  });
});

/** Helper: set the nested composition value on a nested raw product. */
function withComposition(raw: ProductApiResponse, value: string): ProductApiResponse {
  return {
    ...raw,
    additionalProperties: {
      ...raw.additionalProperties,
      nutritional: { ...raw.additionalProperties?.nutritional, composition: { value } },
    },
  };
}
