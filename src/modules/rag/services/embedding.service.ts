import { Injectable, Inject, Logger } from '@nestjs/common';
import { DATABASE_TOKEN, DrizzleDB } from '../../../database/database.module';
import { productChunks, productEmbeddings } from '../../../database/schema';
import {
  EMBEDDING_PROVIDER_TOKEN,
  EmbeddingProvider,
} from '../providers/embedding.provider.interface';
import { eq } from 'drizzle-orm';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: DrizzleDB,
    @Inject(EMBEDDING_PROVIDER_TOKEN) private readonly embeddingProvider: EmbeddingProvider,
  ) {}

  async buildForChunk(chunkId: string): Promise<void> {
    const [chunk] = await this.db
      .select()
      .from(productChunks)
      .where(eq(productChunks.id, chunkId))
      .limit(1);

    if (!chunk) {
      this.logger.warn(`Chunk ${chunkId} not found`);
      return;
    }

    try {
      const embedding = await this.embeddingProvider.embed(chunk.searchableText);

      await this.db
        .insert(productEmbeddings)
        .values({
          chunkId: chunk.id,
          embedding: embedding,
          modelName: this.embeddingProvider.modelName(),
          contentHash: chunk.contentHash,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [productEmbeddings.chunkId],
          set: {
            embedding: embedding,
            modelName: this.embeddingProvider.modelName(),
            contentHash: chunk.contentHash,
            updatedAt: new Date(),
          },
        });

      await this.db
        .update(productChunks)
        .set({ embeddingStatus: 'ready' })
        .where(eq(productChunks.id, chunkId));
    } catch (err) {
      this.logger.error(`Failed to build embedding for chunk ${chunkId}: ${err}`);
      await this.db
        .update(productChunks)
        .set({ embeddingStatus: 'failed' })
        .where(eq(productChunks.id, chunkId));
    }
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.embeddingProvider.embed(text);
  }
}
