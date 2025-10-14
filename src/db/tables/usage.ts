import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { SUBSCRIPTION_TIERS } from '@/api/services/product-logic.service';

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

    // ============================================================================
    // SUBSCRIPTION IDENTIFICATION
    // ============================================================================
    // Tier name identifies which product plan the user has
    // Used to look up quotas from product-logic.service.ts
    subscriptionTier: text('subscription_tier', {
      enum: SUBSCRIPTION_TIERS,
    })
      .notNull()
      .default('free'),

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
    // TIMESTAMPS
    // ============================================================================
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    index('user_chat_usage_user_idx').on(table.userId),
    index('user_chat_usage_period_idx').on(table.currentPeriodEnd),
  ],
);

/**
 * User Chat Usage History
 *
 * ✅ ANALYTICS ONLY: Historical record of usage for each billing period
 *
 * Stores snapshots of usage at the end of each billing period.
 * Used for analytics, reporting, and tracking usage trends.
 *
 * Note: We store the limits that were active at the time for historical accuracy,
 * but current/future limits always come from product-logic.service.ts
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

    // Usage stats during this period
    threadsCreated: integer('threads_created').notNull().default(0),
    messagesCreated: integer('messages_created').notNull().default(0),
    customRolesCreated: integer('custom_roles_created').notNull().default(0),

    // Historical limits (for analytics - what limits were active at this time)
    threadsLimit: integer('threads_limit').notNull(),
    messagesLimit: integer('messages_limit').notNull(),
    customRolesLimit: integer('custom_roles_limit').notNull(),

    // Subscription info at time of period
    subscriptionTier: text('subscription_tier', {
      enum: SUBSCRIPTION_TIERS,
    }).notNull(),
    isAnnual: integer('is_annual', { mode: 'boolean' }).notNull().default(false),

    // Timestamp
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  table => [
    index('user_chat_usage_history_user_idx').on(table.userId),
    index('user_chat_usage_history_period_idx').on(table.periodStart, table.periodEnd),
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
