import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  numeric,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { products } from './products';

export const cityProducts = pgTable(
  'city_products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rn: uuid('rn').notNull(),
    br: uuid('br').notNull(),
    target: text('target').notNull(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    price: numeric('price', { precision: 10, scale: 2 }),
    oldPrice: numeric('old_price', { precision: 10, scale: 2 }),
    currency: text('currency').default('RUB'),
    isAvailable: boolean('is_available').notNull().default(true),
    isValid: boolean('is_valid').notNull().default(true),
    invalidReason: text('invalid_reason'),
    importedAt: timestamp('imported_at').notNull().defaultNow(),
    rawPayload: jsonb('raw_payload'),
  },
  (table) => ({
    rnBrTargetProductUniq: unique('city_products_uniq').on(
      table.rn,
      table.br,
      table.target,
      table.productId,
    ),
    availabilityIdx: index('idx_city_products_availability').on(
      table.rn,
      table.br,
      table.target,
      table.isAvailable,
      table.isValid,
    ),
    priceIdx: index('idx_city_products_price').on(table.price),
  }),
);

export type CityProduct = typeof cityProducts.$inferSelect;
export type NewCityProduct = typeof cityProducts.$inferInsert;
