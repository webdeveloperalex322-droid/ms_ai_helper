import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmbeddingService } from '../services/embedding.service';
import type { EmbeddingProvider } from '../providers/embedding.provider.interface';

const DIMS = 4;

interface FakeChunk {
  id: string;
  searchableText: string;
  contentHash: string;
}

function vector(seed: number): number[] {
  return Array.from({ length: DIMS }, (_, i) => seed + i);
}

function createFakeDb(chunks: FakeChunk[]) {
  const inserted: any[] = [];
  const updated: any[] = [];

  const db = {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(chunks),
      }),
    }),
    insert: () => ({
      values: (values: any) => ({
        onConflictDoUpdate: () => {
          inserted.push(values);
          return Promise.resolve();
        },
      }),
    }),
    update: () => ({
      set: (values: any) => ({
        where: () => {
          updated.push(values);
          return Promise.resolve();
        },
      }),
    }),
  };

  return { db: db as any, inserted, updated };
}

function createProvider(overrides: Partial<EmbeddingProvider> = {}): EmbeddingProvider {
  return {
    modelName: () => 'test-model',
    dimensions: () => DIMS,
    embed: vi.fn(async () => vector(1)),
    embedBatch: vi.fn(async (texts: string[]) => texts.map((_, i) => vector(i))),
    ...overrides,
  } as EmbeddingProvider;
}

describe('EmbeddingService.buildForChunks', () => {
  let chunks: FakeChunk[];

  beforeEach(() => {
    chunks = [
      { id: 'c1', searchableText: 'text one', contentHash: 'h1' },
      { id: 'c2', searchableText: 'text two', contentHash: 'h2' },
    ];
  });

  it('returns an empty array without touching the provider for an empty input', async () => {
    const { db } = createFakeDb([]);
    const provider = createProvider();
    const service = new EmbeddingService(db, provider);

    await expect(service.buildForChunks([])).resolves.toEqual([]);
    expect(provider.embedBatch).not.toHaveBeenCalled();
  });

  it('embeds the whole batch in a single provider call', async () => {
    const { db } = createFakeDb(chunks);
    const provider = createProvider();
    const service = new EmbeddingService(db, provider);

    const results = await service.buildForChunks(['c1', 'c2']);

    expect(provider.embedBatch).toHaveBeenCalledTimes(1);
    expect(provider.embedBatch).toHaveBeenCalledWith(['text one', 'text two']);
    expect(results).toEqual([
      { chunkId: 'c1', status: 'ready' },
      { chunkId: 'c2', status: 'ready' },
    ]);
  });

  it('persists the embedding with the provider model name and the chunk content hash', async () => {
    const { db, inserted } = createFakeDb(chunks);
    const service = new EmbeddingService(db, createProvider());

    await service.buildForChunks(['c1', 'c2']);

    expect(inserted).toHaveLength(1);
    const rows = inserted[0];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      chunkId: 'c1',
      embedding: vector(0),
      modelName: 'test-model',
      contentHash: 'h1',
    });
    expect(rows[1]).toMatchObject({ chunkId: 'c2', contentHash: 'h2' });
  });

  it('returns results in the requested order', async () => {
    const { db } = createFakeDb(chunks);
    const service = new EmbeddingService(db, createProvider());

    const results = await service.buildForChunks(['c2', 'c1']);

    expect(results.map((r) => r.chunkId)).toEqual(['c2', 'c1']);
  });

  it('marks a missing chunk as failed without failing its neighbours', async () => {
    const { db } = createFakeDb(chunks);
    const service = new EmbeddingService(db, createProvider());

    const results = await service.buildForChunks(['c1', 'missing']);

    expect(results).toEqual([
      { chunkId: 'c1', status: 'ready' },
      { chunkId: 'missing', status: 'failed', error: 'chunk not found' },
    ]);
  });

  it('rejects a vector whose length does not match the provider dimensions', async () => {
    const { db, inserted } = createFakeDb(chunks);
    const provider = createProvider({
      embedBatch: vi.fn(async () => [vector(0), [1, 2]]),
    });
    const service = new EmbeddingService(db, provider);

    const results = await service.buildForChunks(['c1', 'c2']);

    expect(results[0].status).toBe('ready');
    expect(results[1].status).toBe('failed');
    expect(results[1].error).toContain(String(DIMS));
    expect(results[1].error).toContain('2');
    expect(inserted[0]).toHaveLength(1);
    expect(inserted[0][0].chunkId).toBe('c1');
  });

  it('rethrows a provider failure and leaves statuses untouched', async () => {
    const { db, inserted, updated } = createFakeDb(chunks);
    const provider = createProvider({
      embedBatch: vi.fn(async () => {
        throw new Error('429 rate limit');
      }),
    });
    const service = new EmbeddingService(db, provider);

    await expect(service.buildForChunks(['c1', 'c2'])).rejects.toThrow('429 rate limit');
    expect(inserted).toHaveLength(0);
    expect(updated).toHaveLength(0);
  });

  it('marks chunks ready via a status update', async () => {
    const { db, updated } = createFakeDb(chunks);
    const service = new EmbeddingService(db, createProvider());

    await service.buildForChunks(['c1', 'c2']);

    expect(updated).toContainEqual(expect.objectContaining({ embeddingStatus: 'ready' }));
  });
});

describe('EmbeddingService.buildForChunk (existing behaviour preserved)', () => {
  const chunks = [{ id: 'c1', searchableText: 'text one', contentHash: 'h1' }];

  it('builds the embedding for a single chunk', async () => {
    const { db, inserted } = createFakeDb(chunks);
    const provider = createProvider();
    const service = new EmbeddingService(db, provider);

    await service.buildForChunk('c1');

    expect(provider.embedBatch).toHaveBeenCalledWith(['text one']);
    expect(inserted[0][0].chunkId).toBe('c1');
  });

  it('swallows a provider failure and marks the chunk failed', async () => {
    const { db, updated } = createFakeDb(chunks);
    const provider = createProvider({
      embedBatch: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const service = new EmbeddingService(db, provider);

    await expect(service.buildForChunk('c1')).resolves.toBeUndefined();
    expect(updated).toContainEqual(expect.objectContaining({ embeddingStatus: 'failed' }));
  });

  it('does not throw for a missing chunk', async () => {
    const { db } = createFakeDb([]);
    const service = new EmbeddingService(db, createProvider());

    await expect(service.buildForChunk('nope')).resolves.toBeUndefined();
  });
});
