import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  integer,
  index,
} from 'drizzle-orm/pg-core';

export const aiLogs = pgTable(
  'ai_logs',
  {
    requestId: uuid('request_id').primaryKey(),
    sessionId: text('session_id'),
    rn: uuid('rn'),
    br: uuid('br'),
    target: text('target'),
    userMessage: text('user_message'),
    normalizedMessage: text('normalized_message'),
    intent: text('intent'),
    slots: jsonb('slots'),
    suggestionId: uuid('suggestion_id'),
    suggestionCode: text('suggestion_code'),
    retrievedProductIds: jsonb('retrieved_product_ids').$type<string[]>(),
    selectedProductIds: jsonb('selected_product_ids').$type<string[]>(),
    llmPromptVersion: text('llm_prompt_version'),
    llmResponse: jsonb('llm_response'),
    validationStatus: text('validation_status'),
    fallbackUsed: boolean('fallback_used').default(false),
    latencyMs: integer('latency_ms'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    sessionIdx: index('idx_ai_logs_session').on(table.sessionId, table.createdAt),
    createdIdx: index('idx_ai_logs_created').on(table.createdAt),
  }),
);

export type AiLog = typeof aiLogs.$inferSelect;
export type NewAiLog = typeof aiLogs.$inferInsert;
