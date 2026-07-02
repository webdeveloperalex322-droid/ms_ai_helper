import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  unique,
  index,
} from 'drizzle-orm/pg-core';

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rn: uuid('rn').notNull(),
    br: uuid('br').notNull(),
    target: text('target').notNull(),
    categoryId: text('category_id').notNull(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    parentId: text('parent_id'),
    orderIndex: integer('order_index'),
    classifierId: integer('classifier_id'),
    isDefault: boolean('is_default').notNull().default(false),
    iconUrl: text('icon_url'),
    imageUrl: text('image_url'),
    isActive: boolean('is_active').notNull().default(true),
    rawPayload: jsonb('raw_payload'),
    importedAt: timestamp('imported_at').notNull().defaultNow(),
  },
  (table) => ({
    rnBrTargetCatUniq: unique('categories_rn_br_target_cat_uniq').on(
      table.rn,
      table.br,
      table.target,
      table.categoryId,
    ),
    lookupIdx: index('categories_lookup_idx').on(table.rn, table.br, table.target, table.isActive),
  }),
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
