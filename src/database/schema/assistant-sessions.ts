import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const assistantSessions = pgTable('assistant_sessions', {
  sessionId: text('session_id').primaryKey(),
  rn: uuid('rn').notNull(),
  br: uuid('br'),
  target: text('target').notNull(),
  dialogSummary: text('dialog_summary'),
  lastIntent: text('last_intent'),
  lastConstraints: jsonb('last_constraints'),
  expiresAt: timestamp('expires_at').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type AssistantSession = typeof assistantSessions.$inferSelect;
export type NewAssistantSession = typeof assistantSessions.$inferInsert;
