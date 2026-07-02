import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { products } from './products';

export const productChunks = pgTable(
  'product_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    rn: uuid('rn').notNull(),
    br: uuid('br').notNull(),
    target: text('target').notNull(),
    chunkType: text('chunk_type').notNull().default('main'),
    searchableText: text('searchable_text').notNull(),
    metadata: jsonb('metadata').notNull().$type<Record<string, any>>(),
    contentHash: text('content_hash').notNull(),
    embeddingStatus: text('embedding_status').notNull().default('pending'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    productBrIdx: index('idx_product_chunks_product_br').on(table.productId, table.br),
    embeddingStatusIdx: index('idx_product_chunks_embedding_status').on(table.embeddingStatus),
  }),
);

export type ProductChunk = typeof productChunks.$inferSelect;
export type NewProductChunk = typeof productChunks.$inferInsert;
