import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  numeric,
  integer,
  boolean,
  unique,
  index,
} from 'drizzle-orm/pg-core';

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rn: uuid('rn').notNull(),
    externalProductId: uuid('external_product_id').notNull(),
    name: text('name').notNull(),
    categoryId: text('category_id'),
    categoryName: text('category_name'),
    description: text('description'),
    ingredients: jsonb('ingredients').$type<string[]>(),
    allergens: jsonb('allergens').$type<string[]>(),
    tags: jsonb('tags').$type<string[]>(),
    weight: numeric('weight', { precision: 10, scale: 2 }),
    pieces: integer('pieces'),
    calories: numeric('calories', { precision: 10, scale: 2 }),
    protein: numeric('protein', { precision: 10, scale: 2 }),
    fat: numeric('fat', { precision: 10, scale: 2 }),
    carbs: numeric('carbs', { precision: 10, scale: 2 }),
    imageUrl: text('image_url'),
    isActive: boolean('is_active').notNull().default(true),
    rawPayload: jsonb('raw_payload'),
    attributes: jsonb('attributes').$type<{ id: string; name: string }[]>().default([]),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    rnExtIdUniq: unique('products_rn_ext_id_uniq').on(table.rn, table.externalProductId),
    attributesGinIdx: index('products_attributes_gin_idx').using('gin', table.attributes),
  }),
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
