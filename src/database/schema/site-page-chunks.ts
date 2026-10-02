import { pgTable, uuid, text, timestamp, integer, unique, index } from 'drizzle-orm/pg-core';
import { sitePages } from './site-pages';

/** A section of a site page: the unit of embedding and retrieval. */
export const sitePageChunks = pgTable(
  'site_page_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pageId: uuid('page_id')
      .notNull()
      .references(() => sitePages.id, { onDelete: 'cascade' }),
    rn: uuid('rn').notNull(),
    br: uuid('br').notNull(),
    chunkIndex: integer('chunk_index').notNull(),
    heading: text('heading'),
    text: text('text').notNull(),
    contentHash: text('content_hash').notNull(),
    embeddingStatus: text('embedding_status').notNull().default('pending'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    pageChunkUniq: unique('site_page_chunks_page_index_uniq').on(table.pageId, table.chunkIndex),
    rnBrStatusIdx: index('idx_site_page_chunks_rn_br_status').on(
      table.rn,
      table.br,
      table.embeddingStatus,
    ),
  }),
);

export type SitePageChunk = typeof sitePageChunks.$inferSelect;
export type NewSitePageChunk = typeof sitePageChunks.$inferInsert;
