import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Deleted Account Audit - Tracks emails of deleted accounts for abuse prevention
 *
 * Stores SHA-256 hashed emails (GDPR compliant - no raw PII) to detect
 * users repeatedly deleting and recreating accounts to abuse free rounds.
 */
export const deletedAccountAudit = sqliteTable(
  'deleted_account_audit',
  {
    deletionCount: integer('deletion_count').default(1).notNull(),
    emailHash: text('email_hash').notNull().unique(), // SHA-256 hash
    firstDeletedAt: integer('first_deleted_at', { mode: 'timestamp_ms' }).notNull(),
    id: text('id').primaryKey(),
    lastDeletedAt: integer('last_deleted_at', { mode: 'timestamp_ms' }).notNull(),
  },
  table => [
    index('deleted_account_audit_email_hash_idx').on(table.emailHash),
  ],
);
