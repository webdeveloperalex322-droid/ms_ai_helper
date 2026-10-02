import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { productChunks } from './product-chunks';
import { vector } from './vector';

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
