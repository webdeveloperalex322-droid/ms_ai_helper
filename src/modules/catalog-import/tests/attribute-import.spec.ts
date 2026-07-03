import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AttributeImportService } from '../services/attribute-import.service';

const MOCK_ATTRS = [
  {
    id: 'attr-001',
    type: 'PRODUCT',
    attribute: { id: 'attr-001', name: '8 шт.', group: { name: 'Количество', orderIndex: 1 } },
  },
  {
    id: 'attr-002',
    type: 'PRODUCT',
    attribute: { id: 'attr-002', name: 'Острый', group: { name: 'Вкус', orderIndex: 2 } },
  },
];

function makeApiClient(attrs = MOCK_ATTRS) {
  return { getAttributes: vi.fn().mockResolvedValue(attrs) } as any;
}

function makeDb() {
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
  const insert = vi.fn().mockReturnValue({ values });
  return { insert, values, onConflictDoUpdate };
}

function makeJobService() {
  return {
    create: vi.fn().mockResolvedValue({ id: 'job-attr-1' }),
    markSuccess: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  };
}

describe('AttributeImportService', () => {
  let apiClient: ReturnType<typeof makeApiClient>;
  let db: ReturnType<typeof makeDb>;
  let jobService: ReturnType<typeof makeJobService>;
  let service: AttributeImportService;

  beforeEach(() => {
    apiClient = makeApiClient();
    db = makeDb();
    jobService = makeJobService();
    service = new AttributeImportService(db as any, apiClient as any, jobService as any);
  });

  it('upserts all attributes and returns count', async () => {
    const result = await service.importAttributes('rn-test');
    expect(result.imported).toBe(2);
    expect(result.jobId).toBe('job-attr-1');
    expect(apiClient.getAttributes).toHaveBeenCalledWith('rn-test');
    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(jobService.markSuccess).toHaveBeenCalledWith('job-attr-1', { imported: 2 });
  });

  it('creates job with attribute_import type', async () => {
    await service.importAttributes('rn-xyz');
    expect(jobService.create).toHaveBeenCalledWith(
      expect.objectContaining({ jobType: 'attribute_import', rn: 'rn-xyz' }),
    );
  });

  it('marks job failed when API throws', async () => {
    apiClient.getAttributes.mockRejectedValue(new Error('API down'));
    await expect(service.importAttributes('rn-test')).rejects.toThrow('API down');
    expect(jobService.markFailed).toHaveBeenCalledWith('job-attr-1', expect.any(String));
  });

  it('uses attribute.id as externalId', async () => {
    await service.importAttributes('rn-test');
    const firstInsertValues = db.values.mock.calls[0][0];
    expect(firstInsertValues.externalId).toBe('attr-001');
    expect(firstInsertValues.name).toBe('8 шт.');
    expect(firstInsertValues.groupName).toBe('Количество');
  });

  it('handles empty attribute list', async () => {
    apiClient = makeApiClient([]);
    service = new AttributeImportService(db as any, apiClient as any, jobService as any);
    const result = await service.importAttributes('rn-test');
    expect(result.imported).toBe(0);
    expect(db.insert).not.toHaveBeenCalled();
    expect(jobService.markSuccess).toHaveBeenCalledWith('job-attr-1', { imported: 0 });
  });
});
