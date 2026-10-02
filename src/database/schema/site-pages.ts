import { pgTable, uuid, text, timestamp, boolean, unique, index } from 'drizzle-orm/pg-core';

/**
 * One informational page of a city site (delivery terms, bonus programme,
 * restaurants, promotions, legal documents…). Content is the cleaned,
 * markdown-like text produced by the crawler; chunks and embeddings hang off it.
 */
export const sitePages = pgTable(
  'site_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rn: uuid('rn').notNull(),
    br: uuid('br').notNull(),
    url: text('url').notNull(),
    pageKey: text('page_key').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    contentHash: text('content_hash').notNull(),
    source: text('source').notNull().default('crawler'),
    fetchedAt: timestamp('fetched_at').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    rnBrUrlUniq: unique('site_pages_rn_br_url_uniq').on(table.rn, table.br, table.url),
    rnBrActiveIdx: index('idx_site_pages_rn_br_active').on(table.rn, table.br, table.isActive),
  }),
);

export type SitePage = typeof sitePages.$inferSelect;
export type NewSitePage = typeof sitePages.$inferInsert;
