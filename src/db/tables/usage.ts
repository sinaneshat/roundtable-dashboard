import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { user } from './auth';

// ============================================================================
// Subscription Tier Constants
// ============================================================================

/**
 * Subscription Tier Tuple - Const assertion for type safety
 * Used by Drizzle ORM for database enum columns
 *
 * Supported Tiers:
 * - free: Free tier with basic limits
 * - starter: Entry-level paid tier ($20/mo or $200/yr)
 * - pro: Professional tier ($59/mo or $600/yr) - MOST POPULAR
 * - power: High-volume tier ($249/mo or $2500/yr)
 */
export const SUBSCRIPTION_TIERS = ['free', 'starter', 'pro', 'power'] as const;

/**
 * Subscription Tier Type - TypeScript Type
 * Inferred from the const tuple to ensure type safety
 */
export type SubscriptionTier = typeof SUBSCRIPTION_TIERS[number];

/**
 * User Chat Usage Tracking
 * Tracks cumulative usage of chat features per user per billing period
 * Does NOT decrement when users delete threads/messages (usage is permanent)
 */
export const userChatUsage = sqliteTable(
  'user_chat_usage',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),

    // Current billing period tracking
    currentPeriodStart: integer('current_period_start', { mode: 'timestamp' }).notNull(),
    currentPeriodEnd: integer('current_period_end', { mode: 'timestamp' }).notNull(),

    // Thread/Conversation usage (cumulative - never decremented)
    threadsCreated: integer('threads_created').notNull().default(0),
    threadsLimit: integer('threads_limit').notNull(), // From subscription tier

    // Message usage (cumulative - never decremented)
    messagesCreated: integer('messages_created').notNull().default(0),
    messagesLimit: integer('messages_limit').notNull(), // From subscription tier

    // Memory usage (cumulative - never decremented)
    memoriesCreated: integer('memories_created').notNull().default(0),
    memoriesLimit: integer('memories_limit').notNull(), // From subscription tier

    // Custom role usage (cumulative - never decremented)
    customRolesCreated: integer('custom_roles_created').notNull().default(0),
    customRolesLimit: integer('custom_roles_limit').notNull(), // From subscription tier

    // Subscription tier metadata
    subscriptionTier: text('subscription_tier', {
      enum: SUBSCRIPTION_TIERS,
    })
      .notNull()
      .default('free'),
    isAnnual: integer('is_annual', { mode: 'boolean' }).notNull().default(false),

    // Pending tier change (for scheduled downgrades at period end)
    // When set, this tier will be applied at currentPeriodEnd
    pendingTierChange: text('pending_tier_change', {
      enum: SUBSCRIPTION_TIERS,
    }),
    pendingTierIsAnnual: integer('pending_tier_is_annual', { mode: 'boolean' }),
    pendingTierPriceId: text('pending_tier_price_id'), // Stripe price ID for the pending tier

    // Timestamps
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
 * Historical record of usage for each billing period
 * Used for analytics and tracking usage over time
 */
export const userChatUsageHistory = sqliteTable(
  'user_chat_usage_history',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    // Period tracking
    periodStart: integer('period_start', { mode: 'timestamp' }).notNull(),
    periodEnd: integer('period_end', { mode: 'timestamp' }).notNull(),

    // Usage stats for this period
    threadsCreated: integer('threads_created').notNull().default(0),
    threadsLimit: integer('threads_limit').notNull(),
    messagesCreated: integer('messages_created').notNull().default(0),
    messagesLimit: integer('messages_limit').notNull(),
    memoriesCreated: integer('memories_created').notNull().default(0),
    memoriesLimit: integer('memories_limit').notNull(),
    customRolesCreated: integer('custom_roles_created').notNull().default(0),
    customRolesLimit: integer('custom_roles_limit').notNull(),

    // Subscription info at time of period
    subscriptionTier: text('subscription_tier', {
      enum: SUBSCRIPTION_TIERS,
    }).notNull(),
    isAnnual: integer('is_annual', { mode: 'boolean' }).notNull().default(false),

    // Timestamps
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  table => [
    index('user_chat_usage_history_user_idx').on(table.userId),
    index('user_chat_usage_history_period_idx').on(table.periodStart, table.periodEnd),
  ],
);

/**
 * Subscription Tier Quotas Configuration
 * Defines the limits for each subscription tier
 * Can be updated without code changes
 */
export const subscriptionTierQuotas = sqliteTable(
  'subscription_tier_quotas',
  {
    id: text('id').primaryKey(),

    // Tier identification
    tier: text('tier', {
      enum: SUBSCRIPTION_TIERS,
    })
      .notNull(),
    isAnnual: integer('is_annual', { mode: 'boolean' }).notNull().default(false),

    // Chat quotas
    threadsPerMonth: integer('threads_per_month').notNull(),
    messagesPerMonth: integer('messages_per_month').notNull(),
    memoriesPerMonth: integer('memories_per_month').notNull().default(0), // Number of memories user can create
    customRolesPerMonth: integer('custom_roles_per_month').notNull().default(0), // Number of custom roles user can create
    maxAiModels: integer('max_ai_models').notNull().default(5), // Max AI models per thread

    // Feature flags (kept for backward compatibility)
    allowCustomRoles: integer('allow_custom_roles', { mode: 'boolean' })
      .notNull()
      .default(false),
    allowMemories: integer('allow_memories', { mode: 'boolean' }).notNull().default(false),
    allowThreadExport: integer('allow_thread_export', { mode: 'boolean' })
      .notNull()
      .default(false),

    // Metadata
    metadata: text('metadata', { mode: 'json' }).$type<{
      description?: string;
      displayOrder?: number;
      [key: string]: unknown;
    }>(),

    // Timestamps
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    index('subscription_tier_quotas_tier_idx').on(table.tier),
    index('subscription_tier_quotas_annual_idx').on(table.isAnnual),
    index('subscription_tier_quotas_tier_annual_unique_idx').on(table.tier, table.isAnnual),
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
