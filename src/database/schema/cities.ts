import { pgTable, uuid, text, boolean, timestamp, jsonb, unique } from 'drizzle-orm/pg-core';

export const cities = pgTable(
  'cities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rn: uuid('rn').notNull(),
    br: uuid('br').notNull(),
    name: text('name').notNull(),
    slug: text('slug'),
    isActive: boolean('is_active').notNull().default(true),
    rawPayload: jsonb('raw_payload'),
    importedAt: timestamp('imported_at').notNull().defaultNow(),
  },
  (table) => ({
    rnBrUniq: unique('cities_rn_br_uniq').on(table.rn, table.br),
  }),
);

export type City = typeof cities.$inferSelect;
export type NewCity = typeof cities.$inferInsert;
