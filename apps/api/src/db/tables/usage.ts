import { DEFAULT_SUBSCRIPTION_TIER, SUBSCRIPTION_TIERS } from '@roundtable/shared/enums';
import { relations, sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { user } from './auth';

/**
 * User Chat Usage Tracking
 *
 * ✅ STORAGE ONLY: Tracks usage counters and billing period
 * ⚠️ NO BUSINESS LOGIC: All quotas/limits come from product-logic.service.ts
 *
 * What we store:
 * - Usage counters (how much they've used)
 * - Billing period dates
 * - Current subscription tier name (to identify which plan)
 *
 * What we DON'T store:
 * - Quotas/limits (these are in code via product-logic.service.ts)
 * - Pricing rules (these are in code)
 * - Feature flags (these are in code)
 */
export const userChatUsage = sqliteTable(
  'user_chat_usage',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),

    // ============================================================================
    // BILLING PERIOD TRACKING
    // ============================================================================
    currentPeriodStart: integer('current_period_start', { mode: 'timestamp' }).notNull(),
    currentPeriodEnd: integer('current_period_end', { mode: 'timestamp' }).notNull(),

    // ============================================================================
    // USAGE COUNTERS (Cumulative - never decremented)
    // ============================================================================
    threadsCreated: integer('threads_created').notNull().default(0),
    messagesCreated: integer('messages_created').notNull().default(0),
    customRolesCreated: integer('custom_roles_created').notNull().default(0),
    analysisGenerated: integer('analysis_generated').notNull().default(0), // Round summaries generated

    // ============================================================================
    // SUBSCRIPTION IDENTIFICATION
    // ============================================================================
    // Tier name identifies which product plan the user has
    // Used to look up quotas from product-logic.service.ts
    subscriptionTier: text('subscription_tier', {
      enum: SUBSCRIPTION_TIERS,
    })
      .notNull()
      .default(DEFAULT_SUBSCRIPTION_TIER),

    // Billing frequency affects some quota calculations
    isAnnual: integer('is_annual', { mode: 'boolean' }).notNull().default(false),

    // ============================================================================
    // PENDING TIER CHANGES (for scheduled downgrades at period end)
    // ============================================================================
    pendingTierChange: text('pending_tier_change', {
      enum: SUBSCRIPTION_TIERS,
    }),
    pendingTierIsAnnual: integer('pending_tier_is_annual', { mode: 'boolean' }),

    // ============================================================================
    // OPTIMISTIC LOCKING (for concurrent updates)
    // ============================================================================
    // Version column prevents lost updates in concurrent scenarios
    // Increment on every update and check version matches before committing
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
    // Indexes for query performance
    index('user_chat_usage_user_idx').on(table.userId),
    index('user_chat_usage_period_idx').on(table.currentPeriodEnd),

    // ============================================================================
    // DATABASE-LEVEL CONSTRAINTS (Second layer of protection)
    // ============================================================================
    // These constraints enforce business logic rules defined in product-logic.service.ts
    // They provide data integrity protection even if application code has bugs

    // ✅ COUNTER CONSTRAINTS: Prevent negative usage counts
    // Rationale: Usage counters are cumulative and never decremented
    check('check_threads_non_negative', sql`${table.threadsCreated} >= 0`),
    check('check_messages_non_negative', sql`${table.messagesCreated} >= 0`),
    check('check_custom_roles_non_negative', sql`${table.customRolesCreated} >= 0`),
    check('check_analysis_non_negative', sql`${table.analysisGenerated} >= 0`),

    // ✅ VERSION CONSTRAINT: Ensure optimistic locking version is positive
    // Rationale: Version starts at 1 and increments, should never be 0 or negative
    check('check_version_positive', sql`${table.version} > 0`),

    // ✅ PERIOD CONSTRAINT: Ensure billing period end is after start
    // Rationale: Logical date ordering for billing periods
    check('check_period_order', sql`${table.currentPeriodEnd} > ${table.currentPeriodStart}`),
  ],
);

/**
 * User Chat Usage History
 *
 * ✅ ANALYTICS ONLY: Historical record of usage for each billing period
 * ✅ SINGLE SOURCE OF TRUTH: Limits come from TIER_QUOTAS in product-logic.service.ts
 *
 * Stores snapshots of usage counters at the end of each billing period.
 * Used for analytics, reporting, and tracking usage trends.
 *
 * To get historical limits: Look up subscriptionTier in TIER_QUOTAS from code.
 * This ensures the API services folder remains the ONLY source of truth for quota logic.
 *
 * ⚠️ NO LIMIT COLUMNS: All quota/limit logic must be in product-logic.service.ts
 */
export const userChatUsageHistory = sqliteTable(
  'user_chat_usage_history',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    // Period this snapshot represents
    periodStart: integer('period_start', { mode: 'timestamp' }).notNull(),
    periodEnd: integer('period_end', { mode: 'timestamp' }).notNull(),

    // Usage stats during this period (COUNTERS ONLY)
    threadsCreated: integer('threads_created').notNull().default(0),
    messagesCreated: integer('messages_created').notNull().default(0),
    customRolesCreated: integer('custom_roles_created').notNull().default(0),
    analysisGenerated: integer('analysis_generated').notNull().default(0), // Round summaries generated

    // Subscription info at time of period (IDENTIFIER ONLY, not limits)
    // Use this tier to look up historical limits from TIER_QUOTAS in code
    subscriptionTier: text('subscription_tier', {
      enum: SUBSCRIPTION_TIERS,
    }).notNull(),
    isAnnual: integer('is_annual', { mode: 'boolean' }).notNull().default(false),

    // Timestamp
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  table => [
    // Indexes for query performance
    index('user_chat_usage_history_user_idx').on(table.userId),
    index('user_chat_usage_history_period_idx').on(table.periodStart, table.periodEnd),

    // ============================================================================
    // DATABASE-LEVEL CONSTRAINTS (Second layer of protection)
    // ============================================================================

    // ✅ COUNTER CONSTRAINTS: Prevent negative historical usage counts
    // Rationale: Historical snapshots should never have negative values
    check('check_history_threads_non_negative', sql`${table.threadsCreated} >= 0`),
    check('check_history_messages_non_negative', sql`${table.messagesCreated} >= 0`),
    check('check_history_custom_roles_non_negative', sql`${table.customRolesCreated} >= 0`),
    check('check_history_analysis_non_negative', sql`${table.analysisGenerated} >= 0`),

    // ✅ PERIOD CONSTRAINT: Ensure historical period end is after start
    // Rationale: Logical date ordering for archived billing periods
    check('check_history_period_order', sql`${table.periodEnd} > ${table.periodStart}`),
  ],
);

// ============================================================================
// Relations
// ============================================================================

export const userChatUsageRelations = relations(userChatUsage, ({ one }) => ({
  user: one(user, {
    fields: [userChatUsage.userId],
    references: [user.id],
  }),
}));

export const userChatUsageHistoryRelations = relations(userChatUsageHistory, ({ one }) => ({
  user: one(user, {
    fields: [userChatUsageHistory.userId],
    references: [user.id],
  }),
}));
