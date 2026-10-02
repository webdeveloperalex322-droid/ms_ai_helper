import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { sitePageChunks } from './site-page-chunks';
import { vector } from './vector';

export const sitePageEmbeddings = pgTable('site_page_embeddings', {
  chunkId: uuid('chunk_id')
    .primaryKey()
    .references(() => sitePageChunks.id, { onDelete: 'cascade' }),
  embedding: vector('embedding', { dimensions: 1536 }),
  modelName: text('model_name').notNull(),
  contentHash: text('content_hash').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type SitePageEmbedding = typeof sitePageEmbeddings.$inferSelect;
export type NewSitePageEmbedding = typeof sitePageEmbeddings.$inferInsert;
