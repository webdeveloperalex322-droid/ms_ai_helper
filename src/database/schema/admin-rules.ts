import { pgTable, uuid, text, timestamp, jsonb, integer } from 'drizzle-orm/pg-core';

export const adminRules = pgTable('admin_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  rn: uuid('rn').notNull(),
  br: uuid('br'),
  target: text('target').notNull().default('WEB'),
  tone: text('tone'),
  maxCardsInResponse: integer('max_cards_in_response').default(5),
  maxSuggestionsOnScreen: integer('max_suggestions_on_screen').default(8),
  bannedPhrases: jsonb('banned_phrases').$type<string[]>(),
  fallbackTemplates: jsonb('fallback_templates').$type<Record<string, string>>(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type AdminRule = typeof adminRules.$inferSelect;
export type NewAdminRule = typeof adminRules.$inferInsert;
