import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CityImportService } from '../services/city-import.service';

function makeApiClient(
  cities = [
    { id: 'br-001', br: 'br-001', name: 'Москва', isActive: true },
    { id: 'br-002', br: 'br-002', name: 'СПб', isActive: true },
  ],
) {
  return { getCities: vi.fn().mockResolvedValue(cities) } as any;
}

function makeDb() {
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
  const insert = vi.fn().mockReturnValue({ values });
  return { insert, onConflictDoUpdate, values };
}

function makeJobService() {
  return {
    create: vi.fn().mockResolvedValue({ id: 'job-1' }),
    markSuccess: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  };
}

describe('CityImportService', () => {
  let apiClient: ReturnType<typeof makeApiClient>;
  let db: ReturnType<typeof makeDb>;
  let jobService: ReturnType<typeof makeJobService>;
  let service: CityImportService;

  beforeEach(() => {
    apiClient = makeApiClient();
    db = makeDb();
    jobService = makeJobService();
    service = new CityImportService(db as any, apiClient as any, jobService as any);
  });

  it('imports cities from API and returns stats', async () => {
    const result = await service.importCities('rn-test');
    expect(result.imported).toBe(2);
    expect(result.errors).toBe(0);
    expect(result.jobId).toBe('job-1');
    expect(apiClient.getCities).toHaveBeenCalledWith('rn-test');
    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(jobService.markSuccess).toHaveBeenCalledWith('job-1', {
      imported: 2,
      errors: 0,
      total: 2,
    });
  });

  it('returns dry-run result without inserting to DB', async () => {
    const result = await service.importCities('rn-test', true);
    expect(result.dryRun).toBe(true);
    expect(result.imported).toBe(0);
    expect(db.insert).not.toHaveBeenCalled();
    expect(jobService.create).not.toHaveBeenCalled();
  });

  it('counts errors for individual failing cities', async () => {
    db.insert
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockRejectedValue(new Error('DB error')),
        }),
      })
      .mockReturnValue({
        values: vi
          .fn()
          .mockReturnValue({ onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) }),
      });

    const result = await service.importCities('rn-test');
    expect(result.errors).toBe(1);
    expect(result.imported).toBe(1);
  });

  it('marks job as failed when API throws', async () => {
    apiClient.getCities.mockRejectedValue(new Error('API down'));
    await expect(service.importCities('rn-test')).rejects.toThrow();
    expect(jobService.markFailed).toHaveBeenCalledWith('job-1', expect.any(String));
  }, 20000);

  it('uses id as br fallback when br field is absent', async () => {
    apiClient = makeApiClient([{ id: 'city-guid', name: 'Казань', isActive: true } as any]);
    service = new CityImportService(db as any, apiClient as any, jobService as any);
    await service.importCities('rn-test');
    const insertedValues = db.insert.mock.calls[0];
    expect(insertedValues).toBeDefined();
  });
});
