import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchableTextBuilderService } from '../services/searchable-text-builder.service';

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
};

function makeProduct(overrides: Partial<any> = {}): any {
  return {
    id: 'p1',
    rn: 'sushimaster',
    name: 'Ролл с лососем',
    description: 'Нежный лосось',
    categoryId: 'cat1',
    categoryName: 'роллы',
    tags: ['лосось', 'японская кухня'],
    ingredients: ['рис', 'лосось', 'нори'],
    allergens: [],
    weight: 300,
    pieces: 8,
    calories: 250,
    protein: 12,
    fat: 8,
    carbs: 32,
    cityProduct: {
      br: 'test_city',
      target: 'WEB',
      price: '890',
      isAvailable: true,
      isValid: true,
    },
    ...overrides,
  };
}

describe('SearchableTextBuilderService', () => {
  let service: SearchableTextBuilderService;

  beforeEach(() => {
    service = new SearchableTextBuilderService(mockDb as any);
  });

  it('builds searchable text with all fields', () => {
    const text = service.buildSearchableText(makeProduct());
    expect(text).toContain('Ролл с лососем');
    expect(text).toContain('лосось');
    expect(text).toContain('роллы');
    expect(text).toContain('250 ккал');
    expect(text).toContain('890 RUB');
    expect(text).toContain('доступен');
  });

  it('handles product without optional fields', () => {
    const product = makeProduct({
      description: null,
      tags: null,
      ingredients: null,
      allergens: null,
      calories: null,
      protein: null,
      fat: null,
      carbs: null,
      weight: null,
      pieces: null,
      cityProduct: {
        br: 'test_city',
        target: 'WEB',
        price: null,
        isAvailable: false,
        isValid: true,
      },
    });
    const text = service.buildSearchableText(product);
    expect(text).toContain('Ролл с лососем');
    expect(text).toContain('недоступен');
  });

  it('builds correct metadata', () => {
    const meta = service.buildMetadata(makeProduct());
    expect(meta.product_id).toBe('p1');
    expect(meta.is_available).toBe(true);
    expect(meta.price).toBe(890);
    expect(Array.isArray(meta.tags)).toBe(true);
  });

  it('includes attributes in searchable text', () => {
    const product = makeProduct({
      attributes: [
        { id: 'a-001', name: '8 шт.' },
        { id: 'a-002', name: 'Острый' },
      ],
    });
    const text = service.buildSearchableText(product);
    expect(text).toContain('Атрибуты: 8 шт., Острый');
  });

  it('omits Атрибуты line when attributes absent', () => {
    const text = service.buildSearchableText(makeProduct({ attributes: null }));
    expect(text).not.toContain('Атрибуты');
  });

  it('includes attributes array in metadata', () => {
    const attrs = [{ id: 'a-001', name: 'Классический' }];
    const meta = service.buildMetadata(makeProduct({ attributes: attrs }));
    expect(meta.attributes).toEqual(attrs);
  });

  it('metadata attributes defaults to empty array when absent', () => {
    const meta = service.buildMetadata(makeProduct({ attributes: null }));
    expect(meta.attributes).toEqual([]);
  });
});
