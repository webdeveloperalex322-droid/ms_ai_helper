import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, inArray, sql } from 'drizzle-orm';
import { DATABASE_TOKEN, DrizzleDB } from '../../../database/database.module';
import { sitePageChunks, sitePageEmbeddings } from '../../../database/schema';
import {
  EMBEDDING_PROVIDER_TOKEN,
  EmbeddingProvider,
} from '../../rag/providers/embedding.provider.interface';

export interface IndexableChunk {
  id: string;
  text: string;
  contentHash: string;
}

export interface SavedEmbedding {
  chunkId: string;
  embedding: number[];
  modelName: string;
  contentHash: string;
}

export interface IndexChunksOptions {
  batchSize?: number;
  retryDelayMs?: number;
}

export interface IndexChunksResult {
  indexed: number;
  failed: number;
  errors: string[];
}

export const DEFAULT_INDEX_BATCH_SIZE = 32;
const DEFAULT_RETRY_DELAY_MS = 2000;

const RETRYABLE_PATTERN =
  /(timeout|timed out|econnreset|econnrefused|etimedout|eai_again|socket hang up|429|rate.?limit|\b5\d\d\b)/i;

/**
 * Builds embeddings for site page chunks. Small volumes (dozens of chunks per
 * city), so this is deliberately simpler than the product bulk indexer: one
 * retry on transient errors, no concurrency. Data access sits in protected
 * methods so the batching logic is unit-testable without a database.
 */
@Injectable()
export class SitePageIndexerService {
  private readonly logger = new Logger(SitePageIndexerService.name);

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: DrizzleDB,
    @Inject(EMBEDDING_PROVIDER_TOKEN) private readonly provider: EmbeddingProvider,
  ) {}

  async indexChunks(
    chunkIds: string[],
    options: IndexChunksOptions = {},
  ): Promise<IndexChunksResult> {
    const result: IndexChunksResult = { indexed: 0, failed: 0, errors: [] };
    if (chunkIds.length === 0) return result;

    const batchSize = options.batchSize ?? DEFAULT_INDEX_BATCH_SIZE;
    const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

    const rows = await this.loadChunks(chunkIds);
    const byId = new Map(rows.map((row) => [row.id, row]));

    const missing = chunkIds.filter((id) => !byId.has(id));
    for (const id of missing) {
      result.failed++;
      result.errors.push(`chunk ${id}: not found`);
    }

    const present = chunkIds.filter((id) => byId.has(id)).map((id) => byId.get(id)!);

    for (let start = 0; start < present.length; start += batchSize) {
      const batch = present.slice(start, start + batchSize);
      await this.indexBatch(batch, retryDelayMs, result);
    }

    return result;
  }

  private async indexBatch(
    batch: IndexableChunk[],
    retryDelayMs: number,
    result: IndexChunksResult,
  ): Promise<void> {
    const texts = batch.map((chunk) => chunk.text);
    let vectors: number[][];

    try {
      vectors = await this.embedWithRetry(texts, retryDelayMs);
    } catch (err) {
      const message = describe(err);
      this.logger.warn(`Embedding batch of ${batch.length} chunks failed: ${message}`);
      await this.markStatus(
        batch.map((c) => c.id),
        'failed',
      );
      result.failed += batch.length;
      result.errors.push(...batch.map((c) => `chunk ${c.id}: ${message}`));
      return;
    }

    const modelName = this.provider.modelName();
    const dimensions = this.provider.dimensions();
    const good: SavedEmbedding[] = [];
    const bad: string[] = [];

    batch.forEach((chunk, index) => {
      const vector = vectors[index];
      if (!Array.isArray(vector) || vector.length !== dimensions) {
        bad.push(chunk.id);
        result.errors.push(
          `chunk ${chunk.id}: unexpected embedding length ${Array.isArray(vector) ? vector.length : 'none'} (expected ${dimensions})`,
        );
        return;
      }
      good.push({
        chunkId: chunk.id,
        embedding: vector,
        modelName,
        contentHash: chunk.contentHash,
      });
    });

    if (good.length) {
      await this.saveEmbeddings(good);
      await this.markStatus(
        good.map((g) => g.chunkId),
        'ready',
      );
    }
    if (bad.length) {
      await this.markStatus(bad, 'failed');
    }

    result.indexed += good.length;
    result.failed += bad.length;
  }

  private async embedWithRetry(texts: string[], retryDelayMs: number): Promise<number[][]> {
    try {
      return await this.provider.embedBatch(texts);
    } catch (err) {
      if (!isRetryable(err)) throw err;
      await this.sleep(retryDelayMs);
      return this.provider.embedBatch(texts);
    }
  }

  // --- data access (overridden in tests) ---------------------------------

  protected async loadChunks(ids: string[]): Promise<IndexableChunk[]> {
    const rows = await this.db
      .select({
        id: sitePageChunks.id,
        text: sitePageChunks.text,
        contentHash: sitePageChunks.contentHash,
      })
      .from(sitePageChunks)
      .where(ids.length === 1 ? eq(sitePageChunks.id, ids[0]) : inArray(sitePageChunks.id, ids));
    return rows;
  }

  protected async saveEmbeddings(rows: SavedEmbedding[]): Promise<void> {
    const now = new Date();
    await this.db
      .insert(sitePageEmbeddings)
      .values(rows.map((row) => ({ ...row, updatedAt: now })))
      .onConflictDoUpdate({
        target: [sitePageEmbeddings.chunkId],
        set: {
          embedding: sql`excluded.embedding`,
          modelName: sql`excluded.model_name`,
          contentHash: sql`excluded.content_hash`,
          updatedAt: now,
        },
      });
  }

  protected async markStatus(ids: string[], status: 'ready' | 'failed'): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(sitePageChunks)
      .set({ embeddingStatus: status, updatedAt: new Date() })
      .where(ids.length === 1 ? eq(sitePageChunks.id, ids[0]) : inArray(sitePageChunks.id, ids));
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (typeof status === 'number') {
    return status === 408 || status === 429 || status >= 500;
  }
  return RETRYABLE_PATTERN.test(describe(err));
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
