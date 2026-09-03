import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';
import {
  RagBulkIndexerService,
  type BulkIndexCandidateRow,
  type BulkIndexFilters,
  type BulkIndexOptions,
} from '../services/bulk-indexer.service';
import { SearchableTextBuilderService } from '../services/searchable-text-builder.service';
import type { EmbeddingProvider } from '../providers/embedding.provider.interface';
import type { ChunkEmbeddingResult } from '../services/embedding.service';

const MODEL = 'test-model';
const DIMS = 4;

const textBuilder = new SearchableTextBuilderService({} as any);

interface RowSpec {
  seq: number;
  productId?: string;
  rn?: string;
  br?: string;
  target?: string;
  name?: string;
  chunkStatus?: 'pending' | 'ready' | 'failed' | null;
  embeddingContentHash?: string | null;
  embeddingModelName?: string | null;
  /** shortcut: make the row look fully indexed and up to date */
  indexed?: boolean;
}

function makeRow(spec: RowSpec): BulkIndexCandidateRow {
  const productId = spec.productId ?? `p${spec.seq}`;
  const br = spec.br ?? 'br-1';
  const target = spec.target ?? 'WEB';
  const rn = spec.rn ?? 'rn-1';

  const product: any = {
    id: productId,
    rn,
    name: spec.name ?? `Product ${spec.seq}`,
    categoryName: 'Роллы',
    description: null,
    ingredients: null,
    allergens: null,
    tags: null,
    weight: null,
    pieces: null,
    calories: null,
    protein: null,
    fat: null,
    carbs: null,
    attributes: null,
    categoryId: null,
  };

  const cityProduct: any = {
    id: String(spec.seq).padStart(6, '0'),
    rn,
    br,
    target,
    productId,
    price: '500.00',
    isAvailable: true,
  };

  const row: BulkIndexCandidateRow = {
    product,
    cityProduct,
    chunkId: null,
    chunkStatus: spec.chunkStatus ?? null,
    embeddingContentHash: spec.embeddingContentHash ?? null,
    embeddingModelName: spec.embeddingModelName ?? null,
  };

  if (spec.indexed) {
    row.chunkId = `chunk-${productId}-${br}-${target}`;
    row.chunkStatus = spec.chunkStatus ?? 'ready';
    row.embeddingContentHash = hashOf(row);
    row.embeddingModelName = spec.embeddingModelName ?? MODEL;
  }

  return row;
}

function hashOf(row: BulkIndexCandidateRow): string {
  const text = textBuilder.buildSearchableText({
    ...(row.product as any),
    cityProduct: row.cityProduct,
  });
  return createHash('md5').update(text).digest('hex');
}

function makeRows(count: number, overrides: Partial<RowSpec> = {}): BulkIndexCandidateRow[] {
  return Array.from({ length: count }, (_, i) => makeRow({ seq: i + 1, ...overrides }));
}

/** Replaces the drizzle-backed query layer with an in-memory one. */
class TestIndexer extends RagBulkIndexerService {
  pageCalls: { filters: BulkIndexFilters; afterId: string | null; limit: number }[] = [];
  countFilters: BulkIndexFilters | null = null;
  maxRowsHeldAtOnce = 0;

  constructor(
    private readonly rows: BulkIndexCandidateRow[],
    deps: {
      textBuilder: any;
      embeddings: any;
      provider: EmbeddingProvider;
    },
  ) {
    super({} as any, deps.textBuilder, deps.embeddings, deps.provider);
  }

  private matching(filters: BulkIndexFilters): BulkIndexCandidateRow[] {
    return this.rows.filter(
      (row) =>
        (!filters.rn || row.cityProduct.rn === filters.rn) &&
        (!filters.br || row.cityProduct.br === filters.br) &&
        (!filters.target || row.cityProduct.target === filters.target),
    );
  }

  protected async countCandidates(filters: BulkIndexFilters): Promise<number> {
    this.countFilters = filters;
    return this.matching(filters).length;
  }

  protected async fetchPage(
    filters: BulkIndexFilters,
    afterId: string | null,
    limit: number,
  ): Promise<BulkIndexCandidateRow[]> {
    this.pageCalls.push({ filters, afterId, limit });
    const page = this.matching(filters)
      .filter((row) => afterId === null || row.cityProduct.id > afterId)
      .sort((a, b) => a.cityProduct.id.localeCompare(b.cityProduct.id))
      .slice(0, limit);
    this.maxRowsHeldAtOnce = Math.max(this.maxRowsHeldAtOnce, page.length);
    return page;
  }
}

function createProvider(overrides: Partial<EmbeddingProvider> = {}): EmbeddingProvider {
  return {
    modelName: () => MODEL,
    dimensions: () => DIMS,
    embed: vi.fn(async () => [1, 2, 3, 4]),
    embedBatch: vi.fn(async (texts: string[]) => texts.map(() => [1, 2, 3, 4])),
    ...overrides,
  } as EmbeddingProvider;
}

function createDeps(embedOverride?: (chunkIds: string[]) => Promise<ChunkEmbeddingResult[]>) {
  const upsertChunk = vi.fn(
    async (product: any) =>
      `chunk-${product.id}-${product.cityProduct.br}-${product.cityProduct.target}`,
  );

  const buildForChunks = vi.fn(
    embedOverride ??
      (async (chunkIds: string[]) =>
        chunkIds.map((chunkId) => ({ chunkId, status: 'ready' as const }))),
  );

  return {
    textBuilder: {
      buildSearchableText: textBuilder.buildSearchableText.bind(textBuilder),
      upsertChunk,
    },
    embeddings: { buildForChunks },
    provider: createProvider(),
    upsertChunk,
    buildForChunks,
  };
}

function run(indexer: TestIndexer, options: BulkIndexOptions = {}) {
  return indexer.run({ retryBaseDelayMs: 1, ...options });
}

describe('RagBulkIndexerService — traversal (US1)', () => {
  let deps: ReturnType<typeof createDeps>;

  beforeEach(() => {
    deps = createDeps();
  });

  it('processes every candidate row', async () => {
    const indexer = new TestIndexer(makeRows(7), deps);

    const report = await run(indexer, { batchSize: 3, pageSize: 5 });

    expect(report.total).toBe(7);
    expect(report.processed).toBe(7);
    expect(report.skipped).toBe(0);
    expect(report.failed).toBe(0);
    expect(deps.upsertChunk).toHaveBeenCalledTimes(7);
  });

  it('keeps processed + skipped + failed equal to total', async () => {
    const rows = [
      ...makeRows(4),
      ...makeRows(3, { indexed: true }).map((row, i) => {
        row.cityProduct.id = String(100 + i).padStart(6, '0');
        return row;
      }),
    ];
    const indexer = new TestIndexer(rows, deps);

    const report = await run(indexer);

    expect(report.processed + report.skipped + report.failed).toBe(report.total);
  });

  it('pages with a keyset cursor and stops on a short page', async () => {
    const indexer = new TestIndexer(makeRows(12), deps);

    await run(indexer, { pageSize: 5 });

    expect(indexer.pageCalls.map((call) => call.afterId)).toEqual([null, '000005', '000010']);
    expect(indexer.pageCalls.every((call) => call.limit === 5)).toBe(true);
  });

  it('never holds more than one page of rows at a time', async () => {
    const indexer = new TestIndexer(makeRows(2000), deps);

    const report = await run(indexer, { pageSize: 100, batchSize: 25 });

    expect(report.processed).toBe(2000);
    expect(indexer.maxRowsHeldAtOnce).toBeLessThanOrEqual(100);
    expect(report.failures).toHaveLength(0);
  });

  it('stops after the requested limit', async () => {
    const indexer = new TestIndexer(makeRows(50), deps);

    const report = await run(indexer, { limit: 12, pageSize: 10, batchSize: 4 });

    expect(report.processed).toBe(12);
    expect(deps.upsertChunk).toHaveBeenCalledTimes(12);
  });

  it('reports progress at most once per batch', async () => {
    const onProgress = vi.fn();
    const indexer = new TestIndexer(makeRows(10), deps);

    await run(indexer, { batchSize: 5, onProgress });

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress.mock.calls.at(-1)![0]).toMatchObject({
      total: 10,
      processed: 10,
      skipped: 0,
      failed: 0,
    });
  });

  it('returns a full report shape', async () => {
    const indexer = new TestIndexer(makeRows(2), deps);

    const report = await run(indexer);

    expect(report).toMatchObject({
      total: 2,
      processed: 2,
      skipped: 0,
      failed: 0,
      dryRun: false,
      failures: [],
    });
    expect(typeof report.durationMs).toBe('number');
  });

  it('respects an abort signal', async () => {
    const controller = new AbortController();
    const indexer = new TestIndexer(makeRows(100), deps);
    const embedSpy = deps.buildForChunks.mockImplementation(async (chunkIds: string[]) => {
      controller.abort();
      return chunkIds.map((chunkId) => ({ chunkId, status: 'ready' as const }));
    });

    const report = await run(indexer, {
      pageSize: 10,
      batchSize: 10,
      concurrency: 1,
      signal: controller.signal,
    });

    expect(report.processed).toBeLessThan(100);
    expect(embedSpy).toHaveBeenCalled();
  });
});

describe('RagBulkIndexerService — deduplication (US1, INV-1)', () => {
  it('collapses rows that map onto the same chunk key', async () => {
    const deps = createDeps();
    const rows = [
      makeRow({ seq: 1, productId: 'p1', rn: 'rn-1', br: 'br-1', target: 'WEB' }),
      makeRow({ seq: 2, productId: 'p1', rn: 'rn-2', br: 'br-1', target: 'WEB' }),
      makeRow({ seq: 3, productId: 'p2', rn: 'rn-1', br: 'br-1', target: 'WEB' }),
    ];
    const indexer = new TestIndexer(rows, deps);

    const report = await run(indexer, { batchSize: 1, concurrency: 1 });

    expect(report.total).toBe(3);
    expect(report.processed).toBe(2);
    expect(report.skipped).toBe(1);
    expect(deps.upsertChunk).toHaveBeenCalledTimes(2);
  });
});

describe('RagBulkIndexerService — skip rule (US3)', () => {
  it('skips a row whose hash, model and status all match', async () => {
    const deps = createDeps();
    const indexer = new TestIndexer(makeRows(5, { indexed: true }), deps);

    const report = await run(indexer);

    expect(report.skipped).toBe(5);
    expect(report.processed).toBe(0);
    expect(deps.upsertChunk).not.toHaveBeenCalled();
    expect(deps.buildForChunks).not.toHaveBeenCalled();
  });

  it('reprocesses a row whose content hash changed', async () => {
    const deps = createDeps();
    const rows = makeRows(3, { indexed: true });
    rows[1].embeddingContentHash = 'stale-hash';
    const indexer = new TestIndexer(rows, deps);

    const report = await run(indexer);

    expect(report.processed).toBe(1);
    expect(report.skipped).toBe(2);
  });

  it('reprocesses a row embedded by another model', async () => {
    const deps = createDeps();
    const rows = makeRows(3, { indexed: true });
    rows[0].embeddingModelName = 'some-older-model';
    const indexer = new TestIndexer(rows, deps);

    const report = await run(indexer);

    expect(report.processed).toBe(1);
    expect(report.skipped).toBe(2);
  });

  it('reprocesses a row left in failed despite a matching hash', async () => {
    const deps = createDeps();
    const rows = makeRows(2, { indexed: true });
    rows[0].chunkStatus = 'failed';
    const indexer = new TestIndexer(rows, deps);

    const report = await run(indexer);

    expect(report.processed).toBe(1);
    expect(report.skipped).toBe(1);
  });

  it('reprocesses everything under force', async () => {
    const deps = createDeps();
    const indexer = new TestIndexer(makeRows(4, { indexed: true }), deps);

    const report = await run(indexer, { force: true });

    expect(report.processed).toBe(4);
    expect(report.skipped).toBe(0);
  });

  it('is idempotent: a second run over unchanged data calls no provider', async () => {
    const deps = createDeps();
    const rows = makeRows(6);
    const indexer = new TestIndexer(rows, deps);

    const first = await run(indexer);
    expect(first.processed).toBe(6);

    // simulate what the first run wrote
    for (const row of rows) {
      row.chunkId = `chunk-${row.product.id}-${row.cityProduct.br}-${row.cityProduct.target}`;
      row.chunkStatus = 'ready';
      row.embeddingContentHash = hashOf(row);
      row.embeddingModelName = MODEL;
    }
    deps.buildForChunks.mockClear();

    const second = await run(indexer);

    expect(second.skipped).toBe(6);
    expect(second.processed).toBe(0);
    expect(deps.buildForChunks).not.toHaveBeenCalled();
  });
});

describe('RagBulkIndexerService — filters (US2)', () => {
  const rows = [
    makeRow({ seq: 1, rn: 'rn-1', br: 'br-1', target: 'WEB' }),
    makeRow({ seq: 2, rn: 'rn-1', br: 'br-2', target: 'WEB' }),
    makeRow({ seq: 3, rn: 'rn-2', br: 'br-1', target: 'APP' }),
    makeRow({ seq: 4, rn: 'rn-1', br: 'br-1', target: 'APP' }),
  ];

  it('passes each filter down to the query layer', async () => {
    const deps = createDeps();
    const indexer = new TestIndexer(rows, deps);

    await run(indexer, { br: 'br-1' });

    expect(indexer.countFilters).toEqual({ rn: undefined, br: 'br-1', target: undefined });
    expect(indexer.pageCalls[0].filters).toMatchObject({ br: 'br-1' });
  });

  it('narrows to a single city', async () => {
    const deps = createDeps();
    const indexer = new TestIndexer(rows, deps);

    const report = await run(indexer, { br: 'br-2' });

    expect(report.total).toBe(1);
    expect(report.processed).toBe(1);
  });

  it('intersects rn, br and target', async () => {
    const deps = createDeps();
    const indexer = new TestIndexer(rows, deps);

    const report = await run(indexer, { rn: 'rn-1', br: 'br-1', target: 'APP' });

    expect(report.total).toBe(1);
    expect(deps.upsertChunk).toHaveBeenCalledTimes(1);
  });

  it('returns an empty report without traversing when nothing matches', async () => {
    const deps = createDeps();
    const indexer = new TestIndexer(rows, deps);

    const report = await run(indexer, { br: 'br-does-not-exist' });

    expect(report.total).toBe(0);
    expect(report.processed).toBe(0);
    expect(indexer.pageCalls).toHaveLength(0);
    expect(deps.upsertChunk).not.toHaveBeenCalled();
  });
});

describe('RagBulkIndexerService — provider failures (US4)', () => {
  it('retries a failing batch and succeeds on a later attempt', async () => {
    let attempts = 0;
    const deps = createDeps(async (chunkIds: string[]) => {
      attempts++;
      if (attempts < 3) {
        throw new Error('503 upstream unavailable');
      }
      return chunkIds.map((chunkId) => ({ chunkId, status: 'ready' as const }));
    });
    const indexer = new TestIndexer(makeRows(4), deps);

    const report = await run(indexer, { batchSize: 4, retries: 3 });

    expect(attempts).toBe(3);
    expect(report.processed).toBe(4);
    expect(report.failed).toBe(0);
  });

  it('grows the delay between attempts', async () => {
    const delays: number[] = [];
    const deps = createDeps(async () => {
      throw new Error('429 rate limit');
    });
    const indexer = new TestIndexer(makeRows(1), deps);
    (indexer as any).sleep = (ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    };

    await run(indexer, { batchSize: 1, retries: 3, retryBaseDelayMs: 100 });

    expect(delays).toHaveLength(2);
    expect(delays[1]).toBeGreaterThan(delays[0]);
  });

  it('splits an unrecoverable batch to isolate the bad item', async () => {
    const deps = createDeps(async (chunkIds: string[]) => {
      if (chunkIds.length > 1) {
        throw new Error('500 batch exploded');
      }
      if (chunkIds[0].includes('p2')) {
        throw new Error('500 this one is really broken');
      }
      return chunkIds.map((chunkId) => ({ chunkId, status: 'ready' as const }));
    });
    const indexer = new TestIndexer(makeRows(3), deps);

    const report = await run(indexer, { batchSize: 3, retries: 2 });

    expect(report.processed).toBe(2);
    expect(report.failed).toBe(1);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toMatchObject({ productId: 'p2', br: 'br-1', target: 'WEB' });
    expect(report.failures[0].reason).toContain('really broken');
  });

  it('does not retry a deterministic per-item failure', async () => {
    const deps = createDeps(async (chunkIds: string[]) =>
      chunkIds.map((chunkId) => ({
        chunkId,
        status: 'failed' as const,
        error: 'unexpected embedding length: expected 4, got 2',
      })),
    );
    const indexer = new TestIndexer(makeRows(2), deps);

    const report = await run(indexer, { batchSize: 2, retries: 3 });

    expect(deps.buildForChunks).toHaveBeenCalledTimes(1);
    expect(report.failed).toBe(2);
    expect(report.failures[0].reason).toContain('unexpected embedding length');
  });

  it('does not retry a client error that cannot succeed', async () => {
    let calls = 0;
    const deps = createDeps(async () => {
      calls++;
      throw new Error('401 invalid api key');
    });
    const indexer = new TestIndexer(makeRows(1), deps);

    const report = await run(indexer, { batchSize: 1, retries: 3 });

    expect(calls).toBe(1);
    expect(report.failed).toBe(1);
  });

  it('keeps traversing later pages after a failure', async () => {
    let calls = 0;
    const deps = createDeps(async (chunkIds: string[]) => {
      calls++;
      if (calls === 1) {
        throw new Error('401 nope');
      }
      return chunkIds.map((chunkId) => ({ chunkId, status: 'ready' as const }));
    });
    const indexer = new TestIndexer(makeRows(6), deps);

    const report = await run(indexer, { pageSize: 3, batchSize: 3, concurrency: 1, retries: 1 });

    expect(report.failed).toBe(3);
    expect(report.processed).toBe(3);
    expect(report.total).toBe(6);
  });

  it('records a chunk upsert failure without stopping the run', async () => {
    const deps = createDeps();
    deps.upsertChunk.mockImplementationOnce(async () => {
      throw new Error('deadlock detected');
    });
    const indexer = new TestIndexer(makeRows(3), deps);

    const report = await run(indexer, { batchSize: 3 });

    expect(report.failed).toBe(1);
    expect(report.processed).toBe(2);
    expect(report.failures[0].reason).toContain('deadlock');
  });
});

describe('RagBulkIndexerService — dry run (US5)', () => {
  it('writes nothing and calls no provider', async () => {
    const deps = createDeps();
    const rows = [
      ...makeRows(3),
      ...makeRows(2, { indexed: true }).map((row, i) => {
        row.cityProduct.id = String(500 + i).padStart(6, '0');
        return row;
      }),
    ];
    const indexer = new TestIndexer(rows, deps);

    const report = await run(indexer, { dryRun: true });

    expect(report.dryRun).toBe(true);
    expect(report.processed).toBe(3);
    expect(report.skipped).toBe(2);
    expect(report.failed).toBe(0);
    expect(deps.upsertChunk).not.toHaveBeenCalled();
    expect(deps.buildForChunks).not.toHaveBeenCalled();
  });

  it('honours filters while estimating', async () => {
    const deps = createDeps();
    const rows = [
      makeRow({ seq: 1, br: 'br-1' }),
      makeRow({ seq: 2, br: 'br-2' }),
      makeRow({ seq: 3, br: 'br-2' }),
    ];
    const indexer = new TestIndexer(rows, deps);

    const report = await run(indexer, { dryRun: true, br: 'br-2' });

    expect(report.total).toBe(2);
    expect(report.processed).toBe(2);
  });
});
