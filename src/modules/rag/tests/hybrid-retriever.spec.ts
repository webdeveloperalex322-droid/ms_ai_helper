import { describe, it, expect, vi } from 'vitest';
import { HybridRetrieverService } from '../services/hybrid-retriever.service';

function makeProduct(overrides: Partial<any> = {}): any {
  return {
    id: 'p1',
    rn: 'rn',
    name: 'Ролл',
    categoryId: null,
    ingredients: null,
    tags: null,
    attributes: null,
    cityProduct: { br: 'br', target: 'WEB', price: '499', isAvailable: true },
    ...overrides,
  };
}

function makeService() {
  const vectorSearch = { search: vi.fn().mockResolvedValue([{ productId: 'p1', score: 0.8 }]) };
  const keywordSearch = {
    search: vi.fn().mockResolvedValue([{ productId: 'p1', score: 0.5 }]),
  };
  const embeddingService = { embedQuery: vi.fn().mockResolvedValue([0.1, 0.2]) };
  const catalogService = {
    findByCity: vi.fn().mockResolvedValue([makeProduct()]),
  };
  const service = new HybridRetrieverService(
    vectorSearch as any,
    keywordSearch as any,
    embeddingService as any,
    catalogService as any,
  );
  return { service, catalogService };
}

describe('HybridRetrieverService — attribute scoring', () => {
  it('boosts score when product attributes match filter attributeNames', async () => {
    const { service, catalogService } = makeService();

    const productWithAttr = makeProduct({
      attributes: [{ id: 'a-001', name: 'Острый' }],
    });
    const productWithout = makeProduct({ id: 'p2', attributes: [] });

    catalogService.findByCity.mockResolvedValue([productWithAttr, productWithout]);

    const vectorSearch = (service as any).vectorSearch;
    vectorSearch.search.mockResolvedValue([
      { productId: 'p1', score: 0.5 },
      { productId: 'p2', score: 0.5 },
    ]);
    const keywordSearch = (service as any).keywordSearch;
    keywordSearch.search.mockResolvedValue([]);

    const results = await service.retrieve({
      query: 'острый ролл',
      rn: 'rn',
      br: 'br',
      target: 'WEB',
      filters: { attributeNames: ['Острый'] },
    });

    const p1 = results.find((r) => r.product.id === 'p1');
    const p2 = results.find((r) => r.product.id === 'p2');

    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
    expect(p1!.score).toBeGreaterThan(p2!.score);
  });

  it('match is case-insensitive', async () => {
    const { service, catalogService } = makeService();
    const product = makeProduct({ attributes: [{ id: 'a-002', name: 'КЛАССИЧЕСКИЙ' }] });
    catalogService.findByCity.mockResolvedValue([product]);

    const results = await service.retrieve({
      query: 'классический',
      rn: 'rn',
      br: 'br',
      target: 'WEB',
      filters: { attributeNames: ['классический'] },
    });

    expect(results[0].score).toBeGreaterThan(0.1);
  });

  it('no boost when attributeNames filter is empty', async () => {
    const { service, catalogService } = makeService();
    const product = makeProduct({ attributes: [{ id: 'a-001', name: 'Острый' }] });
    catalogService.findByCity.mockResolvedValue([product]);

    const withFilter = await service.retrieve({
      query: 'ролл',
      rn: 'rn',
      br: 'br',
      target: 'WEB',
      filters: { attributeNames: [] },
    });

    const withoutFilter = await service.retrieve({
      query: 'ролл',
      rn: 'rn',
      br: 'br',
      target: 'WEB',
      filters: {},
    });

    expect(withFilter[0].score).toBe(withoutFilter[0].score);
  });
});

describe('HybridRetrieverService — category scoring', () => {
  it('boosts score when the product category is among the resolved ids', async () => {
    const { service, catalogService } = makeService();

    const inCategory = makeProduct({ id: 'p1', categoryId: 'CAT-ROLL' });
    const outOfCategory = makeProduct({ id: 'p2', categoryId: 'CAT-DRINK' });
    catalogService.findByCity.mockResolvedValue([inCategory, outOfCategory]);

    const vectorSearch = (service as any).vectorSearch;
    vectorSearch.search.mockResolvedValue([
      { productId: 'p1', score: 0.5 },
      { productId: 'p2', score: 0.5 },
    ]);
    const keywordSearch = (service as any).keywordSearch;
    keywordSearch.search.mockResolvedValue([]);

    const results = await service.retrieve({
      query: 'роллы',
      rn: 'rn',
      br: 'br',
      target: 'WEB',
      filters: { categoryIds: ['CAT-ROLL', 'CAT-ROLL-PREMIUM'] },
    });

    const p1 = results.find((r) => r.product.id === 'p1');
    const p2 = results.find((r) => r.product.id === 'p2');

    expect(p1!.score).toBeGreaterThan(p2!.score);
  });

  it('gives no category boost when no ids were resolved', async () => {
    const { service, catalogService } = makeService();
    const product = makeProduct({ id: 'p1', categoryId: 'CAT-ROLL' });
    catalogService.findByCity.mockResolvedValue([product]);

    const withIds = await service.retrieve({
      query: 'роллы',
      rn: 'rn',
      br: 'br',
      target: 'WEB',
      filters: { categoryIds: ['CAT-ROLL'] },
    });
    const withoutIds = await service.retrieve({
      query: 'роллы',
      rn: 'rn',
      br: 'br',
      target: 'WEB',
      filters: {},
    });

    expect(withIds[0].score).toBeGreaterThan(withoutIds[0].score);
  });
});
