import { relations, sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import {
  CREDIT_ACTIONS,
  CREDIT_TRANSACTION_TYPES,
  PLAN_TYPES,
} from '@/api/core/enums';

import { user } from './auth';
import { chatThread } from './chat';

/**
 * User Credit Balance
 *
 * Tracks user's credit balance for the token-based billing system.
 * Two plans: 'free' (10K signup credits) and 'paid' ($100/month, 1M credits).
 *
 * Credit System:
 * - 1 credit = 1000 tokens (configurable in product-logic.service.ts)
 * - All actions consume credits (messages, searches, files, threads)
 * - Pre-reservation system prevents overdraft during streaming
 */
export const userCreditBalance = sqliteTable(
  'user_credit_balance',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),

    // ============================================================================
    // CREDIT BALANCE
    // ============================================================================
    balance: integer('balance').notNull().default(0),

    // Reserved credits for in-progress operations (streaming)
    // Available = balance - reservedCredits
    reservedCredits: integer('reserved_credits').notNull().default(0),

    // ============================================================================
    // PLAN CONFIGURATION
    // ============================================================================
    planType: text('plan_type', { enum: PLAN_TYPES })
      .notNull()
      .default('free'),

    // Monthly auto-refill amount (0 for free, 1_000_000 for paid)
    monthlyCredits: integer('monthly_credits').notNull().default(0),

    // Refill timestamps
    lastRefillAt: integer('last_refill_at', { mode: 'timestamp' }),
    nextRefillAt: integer('next_refill_at', { mode: 'timestamp' }),

    // Pay-as-you-go billing (requires payment card on file)
    payAsYouGoEnabled: integer('pay_as_you_go_enabled', { mode: 'boolean' })
      .notNull()
      .default(false),

    // ============================================================================
    // OPTIMISTIC LOCKING
    // ============================================================================
    version: integer('version').notNull().default(1),

    // ============================================================================
    // TIMESTAMPS
    // ============================================================================
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    // Indexes
    index('user_credit_balance_user_idx').on(table.userId),
    index('user_credit_balance_next_refill_idx').on(table.nextRefillAt),

    // Constraints
    check('check_balance_non_negative', sql`${table.balance} >= 0`),
    check('check_reserved_non_negative', sql`${table.reservedCredits} >= 0`),
    check('check_monthly_credits_non_negative', sql`${table.monthlyCredits} >= 0`),
    check('check_version_positive', sql`${table.version} > 0`),
  ],
);

/**
 * Credit Transaction Ledger
 *
 * Immutable audit trail of all credit movements.
 * Used for billing reconciliation, analytics, and debugging.
 *
 * Transaction Types:
 * - credit_grant: Initial signup bonus or manual grant
 * - monthly_refill: Automatic monthly credit renewal for paid users
 * - purchase: Additional credits purchased
 * - deduction: Credits spent on actions
 * - reservation: Credits reserved for in-progress operations
 * - release: Reserved credits released (on error or completion)
 * - adjustment: Manual adjustment by admin
 */
export const creditTransaction = sqliteTable(
  'credit_transaction',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    // ============================================================================
    // TRANSACTION DETAILS
    // ============================================================================
    type: text('type', { enum: CREDIT_TRANSACTION_TYPES }).notNull(),

    // Amount: positive for credits in, negative for deductions
    amount: integer('amount').notNull(),

    // Balance after this transaction
    balanceAfter: integer('balance_after').notNull(),

    // ============================================================================
    // TOKEN BREAKDOWN (for deduction transactions)
    // ============================================================================
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    totalTokens: integer('total_tokens'),
    creditsUsed: integer('credits_used'),

    // ============================================================================
    // REFERENCES
    // ============================================================================
    threadId: text('thread_id')
      .references(() => chatThread.id, { onDelete: 'set null' }),
    messageId: text('message_id'),
    streamId: text('stream_id'), // For reservation tracking

    // ============================================================================
    // ACTION CONTEXT
    // ============================================================================
    action: text('action', { enum: CREDIT_ACTIONS }),

    // Model info (for AI response transactions)
    modelId: text('model_id'),
    // Store pricing at time of transaction (micro-dollars per million tokens)
    modelPricingInputPerMillion: integer('model_pricing_input_per_million'),
    modelPricingOutputPerMillion: integer('model_pricing_output_per_million'),

    // ============================================================================
    // METADATA
    // ============================================================================
    description: text('description'),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),

    // ============================================================================
    // TIMESTAMP
    // ============================================================================
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  table => [
    // Indexes for efficient queries
    index('credit_tx_user_idx').on(table.userId),
    index('credit_tx_type_idx').on(table.type),
    index('credit_tx_created_idx').on(table.createdAt),
    index('credit_tx_thread_idx').on(table.threadId),
    index('credit_tx_stream_idx').on(table.streamId),
    index('credit_tx_action_idx').on(table.action),

    // Composite indexes for common queries
    index('credit_tx_user_created_idx').on(table.userId, table.createdAt),
    index('credit_tx_user_type_idx').on(table.userId, table.type),
  ],
);

// ============================================================================
// Relations
// ============================================================================

export const userCreditBalanceRelations = relations(userCreditBalance, ({ one }) => ({
  user: one(user, {
    fields: [userCreditBalance.userId],
    references: [user.id],
  }),
}));

export const creditTransactionRelations = relations(creditTransaction, ({ one }) => ({
  user: one(user, {
    fields: [creditTransaction.userId],
    references: [user.id],
  }),
  thread: one(chatThread, {
    fields: [creditTransaction.threadId],
    references: [chatThread.id],
  }),
}));
