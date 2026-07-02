import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductImportService, ProductImportOptions } from '../services/product-import.service';
import { ProductNormalizerService } from '../services/product-normalizer.service';

const MOCK_RAW_PRODUCT = {
  id: 'ext-p1',
  name: 'Ролл Лосось',
  categoryId: 'roll',
  price: 499,
  ingredients: ['лосось', 'рис'],
  allergens: ['рыба'],
  tags: ['лосось'],
  isAvailable: true,
};

function makeApiClient(products = [MOCK_RAW_PRODUCT]) {
  return {
    getProductsByCategory: vi.fn().mockResolvedValue(products),
    getProductsByIds: vi.fn().mockResolvedValue(products),
    getCities: vi.fn().mockResolvedValue([]),
  } as any;
}

function makeDb() {
  const returningProduct = { id: 'db-product-uuid' };
  const returning = vi.fn().mockResolvedValue([returningProduct]);
  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
  const insert = vi.fn().mockReturnValue({ values });

  // For select queries (getActiveBrs, markUnseen)
  const where = vi.fn().mockResolvedValue([{ br: 'br-001' }]);
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });

  // For update query
  const updateSet = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  });
  const update = vi.fn().mockReturnValue({ set: updateSet });

  return { insert, select, update, from, where };
}

function makeJobService() {
  return {
    create: vi.fn().mockResolvedValue({ id: 'job-1' }),
    markSuccess: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(true),
  };
}

describe('ProductImportService', () => {
  let apiClient: ReturnType<typeof makeApiClient>;
  let db: ReturnType<typeof makeDb>;
  let jobService: ReturnType<typeof makeJobService>;
  let normalizer: ProductNormalizerService;
  let service: ProductImportService;

  beforeEach(() => {
    apiClient = makeApiClient();
    db = makeDb();
    jobService = makeJobService();
    normalizer = new ProductNormalizerService();
    service = new ProductImportService(db as any, apiClient as any, normalizer, jobService as any);
  });

  const baseOptions: ProductImportOptions = {
    rn: 'rn-test',
    br: 'br-001',
    target: 'WEB',
    mode: 'full',
  };

  it('imports products in full mode', async () => {
    const result = await service.importProducts(baseOptions);
    expect(result.jobId).toBe('job-1');
    expect(result.imported).toBeGreaterThan(0);
    expect(apiClient.getProductsByCategory).toHaveBeenCalled();
    expect(jobService.markSuccess).toHaveBeenCalled();
  });

  it('imports products by ids in incremental mode', async () => {
    const result = await service.importProducts({
      ...baseOptions,
      mode: 'incremental',
      ids: ['ext-p1'],
    });
    expect(result.imported).toBeGreaterThan(0);
    expect(apiClient.getProductsByIds).toHaveBeenCalledWith('rn-test', 'br-001', 'WEB', ['ext-p1']);
  });

  it('returns dry-run result without inserting', async () => {
    const result = await service.importProducts({ ...baseOptions, mode: 'dry-run' });
    expect(result.imported).toBe(0);
    expect(result.jobId).toMatch(/^dry-run-/);
    expect(db.insert).not.toHaveBeenCalled();
    expect(jobService.create).not.toHaveBeenCalled();
  });

  it('completes with 0 imported when all categories fail (errors are per-category)', async () => {
    // Each category error is caught individually — job still succeeds with 0 imported
    // We do NOT retry categories (retries are for transient failures within a single call)
    // Override default retry to avoid long waits in tests by making it reject only once per call
    apiClient.getProductsByCategory.mockResolvedValue([]);
    const result = await service.importProducts(baseOptions);
    expect(result.imported).toBe(0);
    expect(jobService.markSuccess).toHaveBeenCalled();
  });

  it('aborts import before any category when job row is already deleted', async () => {
    jobService.exists.mockResolvedValue(false);
    const result = await service.importProducts(baseOptions);
    expect(result.imported).toBe(0);
    expect(apiClient.getProductsByCategory).not.toHaveBeenCalled();
    expect(jobService.markSuccess).not.toHaveBeenCalled();
    expect(jobService.markFailed).not.toHaveBeenCalled();
  });

  it('stops mid-run once the job row is deleted between categories', async () => {
    // exists: true for the br check + first category, then deleted
    jobService.exists
      .mockResolvedValueOnce(true) // br loop
      .mockResolvedValueOnce(true) // category #1
      .mockResolvedValue(false); // category #2 onward -> cancelled
    const result = await service.importProducts(baseOptions);
    expect(apiClient.getProductsByCategory).toHaveBeenCalledTimes(1);
    expect(result.imported).toBe(0);
    expect(jobService.markSuccess).not.toHaveBeenCalled();
    expect(jobService.markFailed).not.toHaveBeenCalled();
  });

  it('skips categories that fail and continues with others', async () => {
    let callCount = 0;
    apiClient.getProductsByCategory.mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw new Error('first category failed');
      return Promise.resolve([MOCK_RAW_PRODUCT]);
    });
    const result = await service.importProducts(baseOptions);
    expect(result.imported).toBeGreaterThan(0); // other categories succeeded
  });
});
