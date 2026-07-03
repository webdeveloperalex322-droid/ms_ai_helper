import { pgTable, uuid, text, boolean, timestamp, index, unique } from 'drizzle-orm/pg-core';

export const productAttributes = pgTable(
  'product_attributes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rn: uuid('rn').notNull(),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    groupName: text('group_name'),
    isActive: boolean('is_active').notNull().default(true),
    rawPayload: text('raw_payload'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    rnExternalIdUniq: unique('product_attributes_rn_ext_id_uniq').on(table.rn, table.externalId),
    rnIdx: index('idx_product_attributes_rn').on(table.rn),
  }),
);

export type ProductAttribute = typeof productAttributes.$inferSelect;
export type NewProductAttribute = typeof productAttributes.$inferInsert;
