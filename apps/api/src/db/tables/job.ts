import { relations, sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { user } from './auth';
import { chatThread } from './chat';

/**
 * Automated Job Status
 * Lifecycle: pending → running → completed | failed
 */
export const AUTOMATED_JOB_STATUSES = ['pending', 'running', 'completed', 'failed'] as const;
export type AutomatedJobStatus = (typeof AUTOMATED_JOB_STATUSES)[number];

/**
 * Per-round configuration determined by prompt analysis
 */
export type DbRoundConfig = {
  round: number;
  mode: string;
  enableWebSearch: boolean;
};

/**
 * Automated Job Metadata
 * Stores prompt reasoning, round prompts, per-round configs, and error info
 */
export type DbAutomatedJobMetadata = {
  promptReasoning?: string;
  roundPrompts?: string[];
  roundConfigs?: DbRoundConfig[];
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
};

/**
 * Automated Jobs
 * Admin-created jobs that run multi-round AI conversations automatically
 */
export const automatedJob = sqliteTable('automated_job', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  threadId: text('thread_id')
    .references(() => chatThread.id, { onDelete: 'set null' }),

  initialPrompt: text('initial_prompt').notNull(),
  totalRounds: integer('total_rounds').notNull().default(3),
  currentRound: integer('current_round').notNull().default(0),
  autoPublish: integer('auto_publish', { mode: 'boolean' }).notNull().default(false),

  status: text('status', { enum: AUTOMATED_JOB_STATUSES })
    .notNull()
    .default('pending'),

  // Array of model IDs selected for the job
  selectedModels: text('selected_models', { mode: 'json' }).$type<string[]>(),

  // Metadata for job execution details
  metadata: text('metadata', { mode: 'json' }).$type<DbAutomatedJobMetadata>(),

  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .default(sql`(unixepoch() * 1000)`)
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .default(sql`(unixepoch() * 1000)`)
    .$onUpdate(() => new Date())
    .notNull(),
}, table => [
  index('automated_job_user_idx').on(table.userId),
  index('automated_job_status_idx').on(table.status),
  index('automated_job_thread_idx').on(table.threadId),
  index('automated_job_created_idx').on(table.createdAt),
]);

/**
 * Automated Job Relations
 */
export const automatedJobRelations = relations(automatedJob, ({ one }) => ({
  user: one(user, {
    fields: [automatedJob.userId],
    references: [user.id],
  }),
  thread: one(chatThread, {
    fields: [automatedJob.threadId],
    references: [chatThread.id],
  }),
}));
