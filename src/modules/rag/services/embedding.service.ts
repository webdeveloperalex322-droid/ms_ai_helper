import { Injectable, Inject, Logger } from '@nestjs/common';
import { DATABASE_TOKEN, DrizzleDB } from '../../../database/database.module';
import { productChunks, productEmbeddings } from '../../../database/schema';
import {
  EMBEDDING_PROVIDER_TOKEN,
  EmbeddingProvider,
} from '../providers/embedding.provider.interface';
import { eq, inArray, sql } from 'drizzle-orm';

export interface ChunkEmbeddingResult {
  chunkId: string;
  status: 'ready' | 'failed';
  error?: string;
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: DrizzleDB,
    @Inject(EMBEDDING_PROVIDER_TOKEN) private readonly embeddingProvider: EmbeddingProvider,
  ) {}

  /**
   * Single-chunk path. Never throws: a provider failure is logged and the chunk
   * is left in `failed`, which is what the existing callers rely on.
   */
  async buildForChunk(chunkId: string): Promise<void> {
    try {
      const [result] = await this.buildForChunks([chunkId]);

      if (result?.status === 'failed') {
        this.logger.warn(`Chunk ${chunkId} not embedded: ${result.error}`);
      }
    } catch (err) {
      this.logger.error(`Failed to build embedding for chunk ${chunkId}: ${err}`);
      await this.markStatus([chunkId], 'failed');
    }
  }

  /**
   * Batch path used by the bulk indexer: one provider call per batch instead of
   * one per chunk.
   *
   * Per-chunk problems (missing chunk, wrong vector length) come back as
   * `failed` results. A provider failure affects the whole batch and is thrown,
   * so the caller can retry it with backoff — nothing is written in that case.
   */
  async buildForChunks(chunkIds: string[]): Promise<ChunkEmbeddingResult[]> {
    if (chunkIds.length === 0) {
      return [];
    }

    const rows = await this.db
      .select()
      .from(productChunks)
      .where(inArray(productChunks.id, chunkIds));

    const byId = new Map(rows.map((row) => [row.id, row]));
    const results = new Map<string, ChunkEmbeddingResult>();
    const present: string[] = [];

    for (const chunkId of chunkIds) {
      if (byId.has(chunkId)) {
        present.push(chunkId);
      } else {
        results.set(chunkId, { chunkId, status: 'failed', error: 'chunk not found' });
      }
    }

    if (present.length > 0) {
      const texts = present.map((id) => byId.get(id)!.searchableText);
      const vectors = await this.embeddingProvider.embedBatch(texts);

      const modelName = this.embeddingProvider.modelName();
      const dimensions = this.embeddingProvider.dimensions();
      const now = new Date();
      const values: (typeof productEmbeddings.$inferInsert)[] = [];

      present.forEach((chunkId, index) => {
        const vector = vectors[index];

        if (!Array.isArray(vector) || vector.length !== dimensions) {
          results.set(chunkId, {
            chunkId,
            status: 'failed',
            error: `unexpected embedding length: expected ${dimensions}, got ${
              Array.isArray(vector) ? vector.length : 'nothing'
            }`,
          });
          return;
        }

        values.push({
          chunkId,
          embedding: vector,
          modelName,
          contentHash: byId.get(chunkId)!.contentHash,
          updatedAt: now,
        });
        results.set(chunkId, { chunkId, status: 'ready' });
      });

      if (values.length > 0) {
        await this.db
          .insert(productEmbeddings)
          .values(values)
          .onConflictDoUpdate({
            target: [productEmbeddings.chunkId],
            set: {
              embedding: sql`excluded.embedding`,
              modelName: sql`excluded.model_name`,
              contentHash: sql`excluded.content_hash`,
              updatedAt: now,
            },
          });

        await this.markStatus(
          values.map((value) => value.chunkId),
          'ready',
        );
      }

      const failedIds = present.filter((id) => results.get(id)?.status === 'failed');
      if (failedIds.length > 0) {
        await this.markStatus(failedIds, 'failed');
      }
    }

    return chunkIds.map((chunkId) => results.get(chunkId)!);
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.embeddingProvider.embed(text);
  }

  private async markStatus(chunkIds: string[], status: 'ready' | 'failed'): Promise<void> {
    if (chunkIds.length === 0) {
      return;
    }

    await this.db
      .update(productChunks)
      .set({ embeddingStatus: status })
      .where(
        chunkIds.length === 1
          ? eq(productChunks.id, chunkIds[0])
          : inArray(productChunks.id, chunkIds),
      );
  }
}
