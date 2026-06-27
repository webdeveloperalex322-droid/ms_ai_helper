import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const retailNetworks = pgTable('retail_networks', {
  id: uuid('id').primaryKey().defaultRandom(),
  rn: uuid('rn').notNull().unique(),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type RetailNetwork = typeof retailNetworks.$inferSelect;
export type NewRetailNetwork = typeof retailNetworks.$inferInsert;
