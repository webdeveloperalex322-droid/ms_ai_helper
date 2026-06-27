import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { assistantSuggestions } from './assistant-suggestions';

export const assistantSuggestionEvents = pgTable(
  'assistant_suggestion_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    suggestionId: uuid('suggestion_id').references(() => assistantSuggestions.id),
    requestId: uuid('request_id'),
    sessionId: text('session_id'),
    rn: uuid('rn').notNull(),
    br: uuid('br'),
    target: text('target').notNull(),
    eventType: text('event_type').notNull(),
    retrievedProductIds: jsonb('retrieved_product_ids').$type<string[]>(),
    selectedProductIds: jsonb('selected_product_ids').$type<string[]>(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    suggestionIdx: index('idx_suggestion_events_suggestion').on(
      table.suggestionId,
      table.createdAt,
    ),
    eventTypeIdx: index('idx_suggestion_events_type').on(table.eventType, table.createdAt),
  }),
);

export type AssistantSuggestionEvent = typeof assistantSuggestionEvents.$inferSelect;
export type NewAssistantSuggestionEvent = typeof assistantSuggestionEvents.$inferInsert;
