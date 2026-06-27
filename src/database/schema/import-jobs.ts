import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const importJobs = pgTable(
  'import_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobType: text('job_type').notNull(),
    rn: uuid('rn').notNull(),
    br: uuid('br'),
    target: text('target'),
    status: text('status').notNull(),
    startedAt: timestamp('started_at').notNull().defaultNow(),
    finishedAt: timestamp('finished_at'),
    stats: jsonb('stats'),
    error: text('error'),
  },
  (table) => ({
    statusIdx: index('idx_import_jobs_status').on(table.jobType, table.status, table.startedAt),
  }),
);

export type ImportJob = typeof importJobs.$inferSelect;
export type NewImportJob = typeof importJobs.$inferInsert;
