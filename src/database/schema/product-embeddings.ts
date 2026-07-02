import { pgTable, uuid, text, timestamp, customType } from 'drizzle-orm/pg-core';
import { productChunks } from './product-chunks';

// Custom type for pgvector
const vector = customType<{ data: number[]; driverData: string }>({
  dataType(config?: { dimensions?: number }) {
    return config?.dimensions ? `vector(${config.dimensions})` : 'vector';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return value.replace('[', '').replace(']', '').split(',').map(Number);
  },
});

export const productEmbeddings = pgTable('product_embeddings', {
  chunkId: uuid('chunk_id')
    .primaryKey()
    .references(() => productChunks.id, { onDelete: 'cascade' }),
  embedding: vector('embedding', { dimensions: 1536 }),
  modelName: text('model_name').notNull(),
  contentHash: text('content_hash').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type ProductEmbedding = typeof productEmbeddings.$inferSelect;
export type NewProductEmbedding = typeof productEmbeddings.$inferInsert;
