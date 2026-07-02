import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CategoryImportService } from '../services/category-import.service';

const MOCK_CATEGORIES = [
  { categoryId: 'CAT-MAIN', slug: 'main', name: 'Для вас', isDefault: true, orderIndex: 1 },
  { categoryId: 'CAT-ROLL', slug: 'rolly', name: 'Роллы', isDefault: false, orderIndex: 2 },
];

function makeApiClient(payload = { br: 'br-001', categories: MOCK_CATEGORIES }) {
  return { getCategories: vi.fn().mockResolvedValue(payload) } as any;
}

function makeDb(existingCategories: any[] = []) {
  // insert(...).values(...).onConflictDoUpdate(...)
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
  const insert = vi.fn().mockReturnValue({ values });

  // select(...).from(...).where(...) -> used by markUnseen (returns existing categories)
  const where = vi.fn().mockResolvedValue(existingCategories);
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });

  // update(...).set(...).where(...)
  const updWhere = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where: updWhere });
  const update = vi.fn().mockReturnValue({ set });

  return { insert, values, onConflictDoUpdate, select, from, where, update, set, updWhere };
}

function makeJobService() {
  return {
    create: vi.fn().mockResolvedValue({ id: 'job-1' }),
    markSuccess: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(true),
  };
}

describe('CategoryImportService', () => {
  let apiClient: ReturnType<typeof makeApiClient>;
  let db: ReturnType<typeof makeDb>;
  let jobService: ReturnType<typeof makeJobService>;
  let service: CategoryImportService;

  beforeEach(() => {
    apiClient = makeApiClient();
    db = makeDb();
    jobService = makeJobService();
    service = new CategoryImportService(db as any, apiClient as any, jobService as any);
  });

  it('imports categories for a single slug and reports stats', async () => {
    const result = await service.importCategories({ rn: 'rn-test', slug: 'tyumen' });

    expect(apiClient.getCategories).toHaveBeenCalledWith('rn-test', 'tyumen', 'WEB');
    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(result.imported).toBe(2);
    expect(result.errors).toBe(0);
    expect(result.cities).toBe(1);
    expect(jobService.markSuccess).toHaveBeenCalledWith('job-1', {
      imported: 2,
      errors: 0,
      cities: 1,
    });
  });

  it('creates a category_import job', async () => {
    await service.importCategories({ rn: 'rn-test', slug: 'tyumen' });
    expect(jobService.create).toHaveBeenCalledWith(
      expect.objectContaining({ jobType: 'category_import', rn: 'rn-test' }),
    );
  });

  it('upserts on conflict (idempotent re-run inserts same rows, no throw)', async () => {
    await service.importCategories({ rn: 'rn-test', slug: 'tyumen' });
    await service.importCategories({ rn: 'rn-test', slug: 'tyumen' });
    expect(db.onConflictDoUpdate).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalledTimes(4); // 2 categories x 2 runs
  });

  it('collapses categories sharing a slug (uniquify by slug)', async () => {
    apiClient = makeApiClient({
      br: 'br-001',
      categories: [
        { categoryId: 'CAT-A', slug: 'rolly', name: 'Роллы', isDefault: false, orderIndex: 1 },
        { categoryId: 'CAT-B', slug: 'rolly', name: 'Роллы (дубль)', isDefault: false, orderIndex: 2 },
        { categoryId: 'CAT-C', slug: 'main', name: 'Для вас', isDefault: false, orderIndex: 3 },
      ],
    });
    service = new CategoryImportService(db as any, apiClient as any, jobService as any);

    const result = await service.importCategories({ rn: 'rn-test', slug: 'tyumen' });

    // Two distinct slugs => two inserts, second 'rolly' dropped.
    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(result.imported).toBe(2);
    expect(result.errors).toBe(0);
  });

  it('does not deactivate anything when the fetch returns zero categories', async () => {
    apiClient = makeApiClient({ br: 'br-001', categories: [] });
    service = new CategoryImportService(db as any, apiClient as any, jobService as any);

    const result = await service.importCategories({ rn: 'rn-test', slug: 'tyumen' });

    expect(result.imported).toBe(0);
    expect(db.update).not.toHaveBeenCalled();
    expect(jobService.markSuccess).toHaveBeenCalled();
  });

  it('iterates active city slugs from DB when no slug is provided', async () => {
    db = makeDb();
    // getActiveCitySlugs: select().from(cities).where() -> rows with slug
    db.where.mockResolvedValueOnce([{ slug: 'tyumen' }, { slug: 'adler' }]);
    service = new CategoryImportService(db as any, apiClient as any, jobService as any);

    const result = await service.importCategories({ rn: 'rn-test' });

    expect(apiClient.getCategories).toHaveBeenCalledTimes(2);
    expect(result.cities).toBe(2);
    // Categories are network-global: the second city returns the same slugs, so nothing new is stored.
    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(result.imported).toBe(2);
  });

  it('counts an error and skips a city when no businessRegion is returned', async () => {
    apiClient = makeApiClient({ br: undefined as any, categories: MOCK_CATEGORIES });
    service = new CategoryImportService(db as any, apiClient as any, jobService as any);

    const result = await service.importCategories({ rn: 'rn-test', slug: 'tyumen' });

    expect(result.errors).toBe(1);
    expect(result.imported).toBe(0);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('stops when the job row is deleted (cancellation)', async () => {
    jobService.exists.mockResolvedValue(false);
    const result = await service.importCategories({ rn: 'rn-test', slug: 'tyumen' });
    expect(apiClient.getCategories).not.toHaveBeenCalled();
    expect(result.imported).toBe(0);
    expect(jobService.markSuccess).not.toHaveBeenCalled();
  });

  it('marks the job failed when city-slug lookup throws', async () => {
    db.where.mockRejectedValueOnce(new Error('DB down'));
    service = new CategoryImportService(db as any, apiClient as any, jobService as any);
    await expect(service.importCategories({ rn: 'rn-test' })).rejects.toThrow();
    expect(jobService.markFailed).toHaveBeenCalledWith('job-1', expect.any(String));
  });
});
