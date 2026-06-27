import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  integer,
  unique,
  index,
} from 'drizzle-orm/pg-core';

export interface SuggestionPayload {
  intent: string;
  slots: {
    category?: string;
    preferred_ingredients?: string[];
    excluded_ingredients?: string[];
    tags?: string[];
    budget_max?: number | null;
    spicy?: boolean | null;
    people_count?: number | null;
    excluded_product_names?: string[];
    scenario?: string;
  };
  retrieval_query: string;
}

export interface AvailabilityRules {
  check_products_exist: boolean;
  min_products_count: number;
  hide_if_empty: boolean;
  respect_city_availability: boolean;
  respect_price?: boolean;
}

export interface FallbackPayload {
  reply_text: string;
  quick_replies: string[];
}

export const assistantSuggestions = pgTable(
  'assistant_suggestions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rn: uuid('rn').notNull(),
    code: text('code').notNull(),
    title: text('title').notNull(),
    emoji: text('emoji'),
    enabled: boolean('enabled').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(100),
    screenContext: text('screen_context').default('catalog'),
    target: text('target').notNull().default('WEB'),
    activeFrom: timestamp('active_from'),
    activeTo: timestamp('active_to'),
    allowedBr: jsonb('allowed_br').$type<string[]>(),
    payload: jsonb('payload').notNull().$type<SuggestionPayload>(),
    availabilityRules: jsonb('availability_rules').notNull().$type<AvailabilityRules>(),
    fallbackPayload: jsonb('fallback_payload').$type<FallbackPayload>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    rnCodeUniq: unique('suggestions_rn_code_uniq').on(table.rn, table.code),
    enabledIdx: index('idx_suggestions_rn_enabled').on(table.rn, table.enabled, table.target),
  }),
);

export type AssistantSuggestion = typeof assistantSuggestions.$inferSelect;
export type NewAssistantSuggestion = typeof assistantSuggestions.$inferInsert;
