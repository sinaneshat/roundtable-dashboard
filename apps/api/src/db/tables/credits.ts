import {
  CREDIT_ACTIONS,
  CREDIT_TRANSACTION_TYPES,
  PLAN_TYPES,
  PlanTypes,
} from '@roundtable/shared/enums';
import { relations, sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { CreditTransactionMetadata } from '@/db/validation/credits';

import { user } from './auth';
import { chatThread } from './chat';

/**
 * User Credit Balance
 *
 * Tracks user's credit balance for the token-based billing system.
 * Two plans: 'free' (5K signup credits) and 'paid' ($59/month, 2M credits).
 *
 * Credit System:
 * - 1 credit = 1000 tokens (configurable in product-logic.service.ts)
 * - All actions consume credits (messages, searches, files, threads)
 * - Pre-reservation system prevents overdraft during streaming
 */
export const userCreditBalance = sqliteTable(
  'user_credit_balance',
  {
    // ============================================================================
    // CREDIT BALANCE
    // ============================================================================
    balance: integer('balance').notNull().default(0),
    // ============================================================================
    // TIMESTAMPS
    // ============================================================================
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),

    id: text('id').primaryKey(),

    // Refill timestamps
    lastRefillAt: integer('last_refill_at', { mode: 'timestamp_ms' }),

    // Monthly auto-refill amount (0 for free, 2_000_000 for paid)
    monthlyCredits: integer('monthly_credits').notNull().default(0),

    nextRefillAt: integer('next_refill_at', { mode: 'timestamp_ms' }),

    // ============================================================================
    // PLAN CONFIGURATION
    // ============================================================================
    planType: text('plan_type', { enum: PLAN_TYPES })
      .notNull()
      .default(PlanTypes.FREE),
    // Reserved credits for in-progress operations (streaming)
    // Available = balance - reservedCredits
    reservedCredits: integer('reserved_credits').notNull().default(0),

    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),

    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),
    // ============================================================================
    // OPTIMISTIC LOCKING
    // ============================================================================
    version: integer('version').notNull().default(1),
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
    // ============================================================================
    // ACTION CONTEXT
    // ============================================================================
    action: text('action', { enum: CREDIT_ACTIONS }),
    // Amount: positive for credits in, negative for deductions
    amount: integer('amount').notNull(),

    // Balance after this transaction
    balanceAfter: integer('balance_after').notNull(),

    // ============================================================================
    // TIMESTAMP
    // ============================================================================
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),

    creditsUsed: integer('credits_used'),

    // ============================================================================
    // METADATA
    // ============================================================================
    description: text('description'),
    id: text('id').primaryKey(),
    // ============================================================================
    // TOKEN BREAKDOWN (for deduction transactions)
    // ============================================================================
    inputTokens: integer('input_tokens'),
    messageId: text('message_id'),

    // ✅ TYPE-SAFE: Strictly typed metadata using Zod schema
    metadata: text('metadata', { mode: 'json' }).$type<CreditTransactionMetadata>(),
    // Model info (for AI response transactions)
    modelId: text('model_id'),
    // Store pricing at time of transaction (micro-dollars per million tokens)
    modelPricingInputPerMillion: integer('model_pricing_input_per_million'),

    modelPricingOutputPerMillion: integer('model_pricing_output_per_million'),

    outputTokens: integer('output_tokens'),
    streamId: text('stream_id'), // For reservation tracking
    // ============================================================================
    // REFERENCES
    // ============================================================================
    threadId: text('thread_id')
      .references(() => chatThread.id, { onDelete: 'set null' }),

    totalTokens: integer('total_tokens'),
    // ============================================================================
    // TRANSACTION DETAILS
    // ============================================================================
    type: text('type', { enum: CREDIT_TRANSACTION_TYPES }).notNull(),

    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
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
  thread: one(chatThread, {
    fields: [creditTransaction.threadId],
    references: [chatThread.id],
  }),
  user: one(user, {
    fields: [creditTransaction.userId],
    references: [user.id],
  }),
}));
