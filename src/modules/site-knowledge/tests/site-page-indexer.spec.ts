import { describe, it, expect, vi } from 'vitest';
import {
  SitePageIndexerService,
  type IndexableChunk,
  type SavedEmbedding,
} from '../services/site-page-indexer.service';
import type { EmbeddingProvider } from '../../rag/providers/embedding.provider.interface';

const DIMS = 4;
const MODEL = 'test-model';

function vector(seed: number): number[] {
  return Array.from({ length: DIMS }, (_, i) => seed + i);
}

function makeProvider(embedBatch: EmbeddingProvider['embedBatch']): EmbeddingProvider {
  return {
    modelName: () => MODEL,
    dimensions: () => DIMS,
    embed: vi.fn(async () => vector(0)),
    embedBatch: vi.fn(embedBatch),
  };
}

class TestIndexer extends SitePageIndexerService {
  saved: SavedEmbedding[] = [];
  statuses = new Map<string, string>();
  sleeps: number[] = [];

  constructor(
    provider: EmbeddingProvider,
    private readonly chunks: IndexableChunk[],
  ) {
    super({} as any, provider);
  }

  protected async loadChunks(ids: string[]): Promise<IndexableChunk[]> {
    return this.chunks.filter((c) => ids.includes(c.id));
  }

  protected async saveEmbeddings(rows: SavedEmbedding[]): Promise<void> {
    this.saved.push(...rows);
  }

  protected async markStatus(ids: string[], status: 'ready' | 'failed'): Promise<void> {
    for (const id of ids) this.statuses.set(id, status);
  }

  protected async sleep(ms: number): Promise<void> {
    this.sleeps.push(ms);
  }
}

function chunks(n: number): IndexableChunk[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    text: `text ${i}`,
    contentHash: `h${i}`,
  }));
}

describe('SitePageIndexerService.indexChunks', () => {
  it('embeds in batches of batchSize and stores vectors with model and hash', async () => {
    const provider = makeProvider(async (texts) => texts.map((_, i) => vector(i)));
    const all = chunks(70);
    const indexer = new TestIndexer(provider, all);

    const result = await indexer.indexChunks(
      all.map((c) => c.id),
      { batchSize: 32 },
    );

    expect(provider.embedBatch).toHaveBeenCalledTimes(3); // 32 + 32 + 6
    expect(result).toEqual({ indexed: 70, failed: 0, errors: [] });
    expect(indexer.saved).toHaveLength(70);
    expect(indexer.saved[0]).toMatchObject({ chunkId: 'c0', modelName: MODEL, contentHash: 'h0' });
    expect(indexer.saved[0].embedding).toEqual(vector(0));
    expect([...indexer.statuses.values()].every((s) => s === 'ready')).toBe(true);
  });

  it('marks a chunk failed when the provider returns a vector of the wrong length', async () => {
    const provider = makeProvider(async (texts) =>
      texts.map((_, i) => (i === 1 ? [1, 2] : vector(i))),
    );
    const all = chunks(3);
    const indexer = new TestIndexer(provider, all);

    const result = await indexer.indexChunks(all.map((c) => c.id));

    expect(result.indexed).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toMatch(/c1.*length/);
    expect(indexer.statuses.get('c1')).toBe('failed');
    expect(indexer.statuses.get('c0')).toBe('ready');
    expect(indexer.saved.map((s) => s.chunkId)).toEqual(['c0', 'c2']);
  });

  it('retries once after a retryable provider error', async () => {
    let calls = 0;
    const provider = makeProvider(async (texts) => {
      calls++;
      if (calls === 1) throw Object.assign(new Error('rate limited'), { status: 429 });
      return texts.map((_, i) => vector(i));
    });
    const all = chunks(2);
    const indexer = new TestIndexer(provider, all);

    const result = await indexer.indexChunks(
      all.map((c) => c.id),
      { retryDelayMs: 2000 },
    );

    expect(calls).toBe(2);
    expect(indexer.sleeps).toEqual([2000]);
    expect(result).toEqual({ indexed: 2, failed: 0, errors: [] });
  });

  it('fails the whole batch without retry on a non-retryable error', async () => {
    const provider = makeProvider(async () => {
      throw Object.assign(new Error('invalid api key'), { status: 401 });
    });
    const all = chunks(3);
    const indexer = new TestIndexer(provider, all);

    const result = await indexer.indexChunks(all.map((c) => c.id));

    expect(provider.embedBatch).toHaveBeenCalledTimes(1);
    expect(indexer.sleeps).toEqual([]);
    expect(result.indexed).toBe(0);
    expect(result.failed).toBe(3);
    expect(result.errors[0]).toMatch(/invalid api key/);
    expect([...indexer.statuses.values()]).toEqual(['failed', 'failed', 'failed']);
  });

  it('fails the batch after the retry is exhausted', async () => {
    const provider = makeProvider(async () => {
      throw new Error('ECONNRESET');
    });
    const all = chunks(2);
    const indexer = new TestIndexer(provider, all);

    const result = await indexer.indexChunks(all.map((c) => c.id));

    expect(provider.embedBatch).toHaveBeenCalledTimes(2);
    expect(result.failed).toBe(2);
  });

  it('reports chunks that do not exist as failed and does nothing for an empty list', async () => {
    const provider = makeProvider(async (texts) => texts.map((_, i) => vector(i)));
    const indexer = new TestIndexer(provider, chunks(1));

    expect(await indexer.indexChunks([])).toEqual({ indexed: 0, failed: 0, errors: [] });
    expect(provider.embedBatch).not.toHaveBeenCalled();

    const result = await indexer.indexChunks(['c0', 'missing']);
    expect(result.indexed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toMatch(/missing/);
  });
});
