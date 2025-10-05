/**
 * Usage Tracking Service
 *
 * Handles chat quota tracking and enforcement for subscription tiers
 * Key features:
 * - Tracks thread and message creation (cumulative, never decremented)
 * - Enforces limits based on subscription tier
 * - Handles billing period rollover
 * - Provides usage statistics for UI display
 */

import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { createError } from '@/api/common/error-handling';
import type { ErrorContext } from '@/api/core';
import { apiLogger } from '@/api/middleware/hono-logger';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';
import type {
  QuotaCheck,
  SubscriptionTier,
  UsageStats,
} from '@/db/validation/usage';

/**
 * Get or create user usage record
 * Ensures a user has a usage tracking record for the current billing period
 */
async function ensureUserUsageRecord(userId: string): Promise<typeof tables.userChatUsage.$inferSelect> {
  const db = await getDbAsync();

  // Check if user has existing usage record
  let usage = await db.query.userChatUsage.findFirst({
    where: eq(tables.userChatUsage.userId, userId),
  });

  const now = new Date();

  // If no usage record exists, create one with free tier defaults
  if (!usage) {
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1); // First day of current month
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59); // Last day of current month

    const [newUsage] = await db
      .insert(tables.userChatUsage)
      .values({
        id: ulid(),
        userId,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        threadsCreated: 0,
        threadsLimit: 2, // Free tier default
        messagesCreated: 0,
        messagesLimit: 20, // Free tier default
        memoriesCreated: 0,
        memoriesLimit: 5, // Free tier default - basic memories
        customRolesCreated: 0,
        customRolesLimit: 5, // Free tier default - basic custom roles
        subscriptionTier: 'free',
        isAnnual: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    usage = newUsage;
    apiLogger.info('Created new usage record for user', { userId, tier: 'free' });
  }

  // At this point, usage is guaranteed to be defined
  if (!usage) {
    const context: ErrorContext = {
      errorType: 'database',
      operation: 'select',
      table: 'user_chat_usage',
      userId,
    };
    throw createError.internal('Usage record unexpectedly undefined', context);
  }

  // Check if billing period has expired
  if (usage.currentPeriodEnd < now) {
    await rolloverBillingPeriod(userId, usage);

    // Fetch the updated usage record
    const updatedUsage = await db.query.userChatUsage.findFirst({
      where: eq(tables.userChatUsage.userId, userId),
    });

    if (!updatedUsage) {
      const context: ErrorContext = {
        errorType: 'database',
        operation: 'select',
        table: 'user_chat_usage',
        userId,
      };
      throw createError.internal('Failed to fetch updated usage record after rollover', context);
    }

    usage = updatedUsage;
  }

  return usage;
}

/**
 * Rollover billing period
 * Archives current usage and resets counters for new period
 */
async function rolloverBillingPeriod(
  userId: string,
  currentUsage: typeof tables.userChatUsage.$inferSelect,
): Promise<void> {
  const db = await getDbAsync();
  const now = new Date();

  // Archive current usage to history
  await db.insert(tables.userChatUsageHistory).values({
    id: ulid(),
    userId,
    periodStart: currentUsage.currentPeriodStart,
    periodEnd: currentUsage.currentPeriodEnd,
    threadsCreated: currentUsage.threadsCreated,
    threadsLimit: currentUsage.threadsLimit,
    messagesCreated: currentUsage.messagesCreated,
    messagesLimit: currentUsage.messagesLimit,
    memoriesCreated: currentUsage.memoriesCreated,
    memoriesLimit: currentUsage.memoriesLimit,
    customRolesCreated: currentUsage.customRolesCreated,
    customRolesLimit: currentUsage.customRolesLimit,
    subscriptionTier: currentUsage.subscriptionTier,
    isAnnual: currentUsage.isAnnual,
    createdAt: now,
  });

  // Calculate new period
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // Reset usage counters for new period
  await db
    .update(tables.userChatUsage)
    .set({
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      threadsCreated: 0,
      messagesCreated: 0,
      memoriesCreated: 0,
      customRolesCreated: 0,
      updatedAt: now,
    })
    .where(eq(tables.userChatUsage.userId, userId));

  apiLogger.info('Rolled over billing period for user', {
    userId,
    oldPeriod: { start: currentUsage.currentPeriodStart, end: currentUsage.currentPeriodEnd },
    newPeriod: { start: periodStart, end: periodEnd },
  });
}

/**
 * Check thread creation quota
 * Returns whether user can create a new thread and current usage stats
 */
export async function checkThreadQuota(userId: string): Promise<QuotaCheck> {
  const usage = await ensureUserUsageRecord(userId);

  const canCreate = usage.threadsCreated < usage.threadsLimit;
  const remaining = Math.max(0, usage.threadsLimit - usage.threadsCreated);

  return {
    canCreate,
    current: usage.threadsCreated,
    limit: usage.threadsLimit,
    remaining,
    resetDate: usage.currentPeriodEnd,
    tier: usage.subscriptionTier,
  };
}

/**
 * Check message creation quota
 * Returns whether user can send a new message and current usage stats
 */
export async function checkMessageQuota(userId: string): Promise<QuotaCheck> {
  const usage = await ensureUserUsageRecord(userId);

  const canCreate = usage.messagesCreated < usage.messagesLimit;
  const remaining = Math.max(0, usage.messagesLimit - usage.messagesCreated);

  return {
    canCreate,
    current: usage.messagesCreated,
    limit: usage.messagesLimit,
    remaining,
    resetDate: usage.currentPeriodEnd,
    tier: usage.subscriptionTier,
  };
}

/**
 * Check memory creation quota
 * Returns whether user can create a new memory and current usage stats
 */
export async function checkMemoryQuota(userId: string): Promise<QuotaCheck> {
  const usage = await ensureUserUsageRecord(userId);

  const canCreate = usage.memoriesCreated < usage.memoriesLimit;
  const remaining = Math.max(0, usage.memoriesLimit - usage.memoriesCreated);

  return {
    canCreate,
    current: usage.memoriesCreated,
    limit: usage.memoriesLimit,
    remaining,
    resetDate: usage.currentPeriodEnd,
    tier: usage.subscriptionTier,
  };
}

/**
 * Check custom role creation quota
 * Returns whether user can create a new custom role and current usage stats
 */
export async function checkCustomRoleQuota(userId: string): Promise<QuotaCheck> {
  const usage = await ensureUserUsageRecord(userId);

  const canCreate = usage.customRolesCreated < usage.customRolesLimit;
  const remaining = Math.max(0, usage.customRolesLimit - usage.customRolesCreated);

  return {
    canCreate,
    current: usage.customRolesCreated,
    limit: usage.customRolesLimit,
    remaining,
    resetDate: usage.currentPeriodEnd,
    tier: usage.subscriptionTier,
  };
}

/**
 * Increment thread creation counter
 * Must be called AFTER successfully creating a thread
 * Does NOT decrement when threads are deleted
 */
export async function incrementThreadUsage(userId: string): Promise<void> {
  const db = await getDbAsync();
  const usage = await ensureUserUsageRecord(userId);

  await db
    .update(tables.userChatUsage)
    .set({
      threadsCreated: usage.threadsCreated + 1,
      updatedAt: new Date(),
    })
    .where(eq(tables.userChatUsage.userId, userId));

  apiLogger.info('Incremented thread usage for user', {
    userId,
    newCount: usage.threadsCreated + 1,
    limit: usage.threadsLimit,
  });
}

/**
 * Increment message creation counter
 * Must be called AFTER successfully creating a message
 * Does NOT decrement when messages are deleted
 */
export async function incrementMessageUsage(userId: string, count = 1): Promise<void> {
  const db = await getDbAsync();
  const usage = await ensureUserUsageRecord(userId);

  await db
    .update(tables.userChatUsage)
    .set({
      messagesCreated: usage.messagesCreated + count,
      updatedAt: new Date(),
    })
    .where(eq(tables.userChatUsage.userId, userId));

  apiLogger.info('Incremented message usage for user', {
    userId,
    count,
    newCount: usage.messagesCreated + count,
    limit: usage.messagesLimit,
  });
}

/**
 * Increment memory creation counter
 * Must be called AFTER successfully creating a memory
 * Does NOT decrement when memories are deleted
 */
export async function incrementMemoryUsage(userId: string, count = 1): Promise<void> {
  const db = await getDbAsync();
  const usage = await ensureUserUsageRecord(userId);

  await db
    .update(tables.userChatUsage)
    .set({
      memoriesCreated: usage.memoriesCreated + count,
      updatedAt: new Date(),
    })
    .where(eq(tables.userChatUsage.userId, userId));

  apiLogger.info('Incremented memory usage for user', {
    userId,
    count,
    newCount: usage.memoriesCreated + count,
    limit: usage.memoriesLimit,
  });
}

/**
 * Increment custom role creation counter
 * Must be called AFTER successfully creating a custom role
 * Does NOT decrement when custom roles are deleted
 */
export async function incrementCustomRoleUsage(userId: string, count = 1): Promise<void> {
  const db = await getDbAsync();
  const usage = await ensureUserUsageRecord(userId);

  await db
    .update(tables.userChatUsage)
    .set({
      customRolesCreated: usage.customRolesCreated + count,
      updatedAt: new Date(),
    })
    .where(eq(tables.userChatUsage.userId, userId));

  apiLogger.info('Incremented custom role usage for user', {
    userId,
    count,
    newCount: usage.customRolesCreated + count,
    limit: usage.customRolesLimit,
  });
}

/**
 * Get comprehensive usage statistics for a user
 * Used for displaying usage in the UI
 */
export async function getUserUsageStats(userId: string): Promise<UsageStats> {
  const usage = await ensureUserUsageRecord(userId);
  const now = new Date();

  const threadsRemaining = Math.max(0, usage.threadsLimit - usage.threadsCreated);
  const messagesRemaining = Math.max(0, usage.messagesLimit - usage.messagesCreated);
  const memoriesRemaining = Math.max(0, usage.memoriesLimit - usage.memoriesCreated);
  const customRolesRemaining = Math.max(0, usage.customRolesLimit - usage.customRolesCreated);

  const threadsPercentage = usage.threadsLimit > 0
    ? Math.round((usage.threadsCreated / usage.threadsLimit) * 100)
    : 0;

  const messagesPercentage = usage.messagesLimit > 0
    ? Math.round((usage.messagesCreated / usage.messagesLimit) * 100)
    : 0;

  const memoriesPercentage = usage.memoriesLimit > 0
    ? Math.round((usage.memoriesCreated / usage.memoriesLimit) * 100)
    : 0;

  const customRolesPercentage = usage.customRolesLimit > 0
    ? Math.round((usage.customRolesCreated / usage.customRolesLimit) * 100)
    : 0;

  const daysRemaining = Math.ceil(
    (usage.currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );

  return {
    threads: {
      used: usage.threadsCreated,
      limit: usage.threadsLimit,
      remaining: threadsRemaining,
      percentage: threadsPercentage,
    },
    messages: {
      used: usage.messagesCreated,
      limit: usage.messagesLimit,
      remaining: messagesRemaining,
      percentage: messagesPercentage,
    },
    memories: {
      used: usage.memoriesCreated,
      limit: usage.memoriesLimit,
      remaining: memoriesRemaining,
      percentage: memoriesPercentage,
    },
    customRoles: {
      used: usage.customRolesCreated,
      limit: usage.customRolesLimit,
      remaining: customRolesRemaining,
      percentage: customRolesPercentage,
    },
    period: {
      start: usage.currentPeriodStart,
      end: usage.currentPeriodEnd,
      daysRemaining,
    },
    subscription: {
      tier: usage.subscriptionTier,
      isAnnual: usage.isAnnual,
    },
  };
}

/**
 * Update user subscription tier and quotas
 * Called when user subscribes, upgrades, or downgrades
 */
export async function updateUserSubscriptionTier(
  userId: string,
  tier: SubscriptionTier,
  isAnnual: boolean,
): Promise<void> {
  const db = await getDbAsync();

  // Get quota config for this tier
  const quotaConfig = await db.query.subscriptionTierQuotas.findFirst({
    where: and(
      eq(tables.subscriptionTierQuotas.tier, tier),
      eq(tables.subscriptionTierQuotas.isAnnual, isAnnual),
    ),
  });

  if (!quotaConfig) {
    const context: ErrorContext = {
      errorType: 'resource',
      resource: 'subscription_tier_quotas',
      resourceId: `${tier}-${isAnnual ? 'annual' : 'monthly'}`,
    };
    throw createError.notFound(`Quota configuration not found for tier: ${tier}`, context);
  }

  // Ensure usage record exists
  await ensureUserUsageRecord(userId);

  // Update subscription tier and limits
  await db
    .update(tables.userChatUsage)
    .set({
      subscriptionTier: tier,
      isAnnual,
      threadsLimit: quotaConfig.threadsPerMonth,
      messagesLimit: quotaConfig.messagesPerMonth,
      updatedAt: new Date(),
    })
    .where(eq(tables.userChatUsage.userId, userId));

  apiLogger.info('Updated user subscription tier', {
    userId,
    tier,
    isAnnual,
    newLimits: {
      threads: quotaConfig.threadsPerMonth,
      messages: quotaConfig.messagesPerMonth,
    },
  });
}

/**
 * Enforce thread quota before creation
 * Throws error if user has exceeded quota
 */
export async function enforceThreadQuota(userId: string): Promise<void> {
  const quota = await checkThreadQuota(userId);

  if (!quota.canCreate) {
    const context: ErrorContext = {
      errorType: 'resource',
      resource: 'chat_thread',
      userId,
    };
    throw createError.badRequest(
      `Thread creation limit reached. You have used ${quota.current} of ${quota.limit} threads this month. Upgrade your plan for more threads.`,
      context,
    );
  }
}

/**
 * Enforce message quota before creation
 * Throws error if user has exceeded quota
 */
export async function enforceMessageQuota(userId: string): Promise<void> {
  const quota = await checkMessageQuota(userId);

  if (!quota.canCreate) {
    const context: ErrorContext = {
      errorType: 'resource',
      resource: 'chat_message',
      userId,
    };
    throw createError.badRequest(
      `Message creation limit reached. You have used ${quota.current} of ${quota.limit} messages this month. Upgrade your plan for more messages.`,
      context,
    );
  }
}

/**
 * Enforce memory quota before creation
 * Throws error if user has exceeded quota
 */
export async function enforceMemoryQuota(userId: string): Promise<void> {
  const quota = await checkMemoryQuota(userId);

  if (!quota.canCreate) {
    const context: ErrorContext = {
      errorType: 'resource',
      resource: 'chat_memory',
      userId,
    };
    throw createError.badRequest(
      `Memory creation limit reached. You have used ${quota.current} of ${quota.limit} memories this month. Upgrade your plan for more memories.`,
      context,
    );
  }
}

/**
 * Enforce custom role quota before creation
 * Throws error if user has exceeded quota
 */
export async function enforceCustomRoleQuota(userId: string): Promise<void> {
  const quota = await checkCustomRoleQuota(userId);

  if (!quota.canCreate) {
    const context: ErrorContext = {
      errorType: 'resource',
      resource: 'chat_custom_role',
      userId,
    };
    throw createError.badRequest(
      `Custom role creation limit reached. You have used ${quota.current} of ${quota.limit} custom roles this month. Upgrade your plan for more custom roles.`,
      context,
    );
  }
}

/**
 * Sync user quotas based on subscription changes
 * Handles new subscriptions, upgrades, downgrades, and cancellations
 *
 * @param userId - User ID to update quotas for
 * @param priceId - Stripe price ID from the subscription
 * @param isActive - Whether the subscription is active (not canceled)
 * @param currentPeriodEnd - End date of the current billing period
 */
export async function syncUserQuotaFromSubscription(
  userId: string,
  priceId: string,
  isActive: boolean,
  currentPeriodEnd: Date,
): Promise<void> {
  const db = await getDbAsync();

  // Get price metadata to determine tier and billing period
  const price = await db.query.stripePrice.findFirst({
    where: eq(tables.stripePrice.id, priceId),
  });

  if (!price) {
    const context: ErrorContext = {
      errorType: 'resource',
      resource: 'stripe_price',
      resourceId: priceId,
    };
    throw createError.notFound(`Price not found: ${priceId}`, context);
  }

  // Extract tier and billing period from price metadata
  const tier = price.metadata?.tier as SubscriptionTier | undefined;
  const isAnnual = price.interval === 'year';

  if (!tier) {
    apiLogger.warn('Price metadata missing tier information', { priceId });
    return;
  }

  // If subscription is not active (canceled), don't modify quotas
  // Quotas remain until currentPeriodEnd
  if (!isActive) {
    apiLogger.info('Subscription not active, preserving quotas until period end', {
      userId,
      tier,
      currentPeriodEnd,
    });
    return;
  }

  // Get quota configuration for the new tier
  const quotaConfig = await db.query.subscriptionTierQuotas.findFirst({
    where: and(
      eq(tables.subscriptionTierQuotas.tier, tier),
      eq(tables.subscriptionTierQuotas.isAnnual, isAnnual),
    ),
  });

  if (!quotaConfig) {
    const context: ErrorContext = {
      errorType: 'resource',
      resource: 'subscription_tier_quotas',
      resourceId: `${tier}-${isAnnual ? 'annual' : 'monthly'}`,
    };
    throw createError.notFound(`Quota configuration not found for tier: ${tier}`, context);
  }

  // Get current usage record
  const currentUsage = await ensureUserUsageRecord(userId);

  // Determine if this is an upgrade or downgrade
  const oldThreadsLimit = currentUsage.threadsLimit;
  const oldMessagesLimit = currentUsage.messagesLimit;
  const newThreadsLimit = quotaConfig.threadsPerMonth;
  const newMessagesLimit = quotaConfig.messagesPerMonth;

  const isUpgrade = newThreadsLimit > oldThreadsLimit || newMessagesLimit > oldMessagesLimit;
  const isDowngrade = newThreadsLimit < oldThreadsLimit || newMessagesLimit < oldMessagesLimit;

  // Calculate quota updates based on subscription change type
  let updatedThreadsLimit = newThreadsLimit;
  let updatedMessagesLimit = newMessagesLimit;

  if (isUpgrade) {
    // For upgrades: Add the difference to current limits (compounding)
    const threadsDifference = Math.max(0, newThreadsLimit - oldThreadsLimit);
    const messagesDifference = Math.max(0, newMessagesLimit - oldMessagesLimit);

    updatedThreadsLimit = currentUsage.threadsLimit + threadsDifference;
    updatedMessagesLimit = currentUsage.messagesLimit + messagesDifference;

    apiLogger.info('Upgrading subscription - compounding quota difference', {
      userId,
      oldTier: currentUsage.subscriptionTier,
      newTier: tier,
      threadsDifference,
      messagesDifference,
      oldLimits: { threads: oldThreadsLimit, messages: oldMessagesLimit },
      newLimits: { threads: updatedThreadsLimit, messages: updatedMessagesLimit },
    });
  } else if (isDowngrade) {
    // For downgrades: Set new limits but don't reduce current usage
    // Current usage stays as is, but limit is reduced
    apiLogger.info('Downgrading subscription - reducing limits', {
      userId,
      oldTier: currentUsage.subscriptionTier,
      newTier: tier,
      oldLimits: { threads: oldThreadsLimit, messages: oldMessagesLimit },
      newLimits: { threads: updatedThreadsLimit, messages: updatedMessagesLimit },
    });
  } else {
    // Same tier (e.g., switching between monthly/annual)
    apiLogger.info('Subscription tier unchanged - updating billing period', {
      userId,
      tier,
      isAnnual,
    });
  }

  // Update user usage record with new subscription tier and limits
  await db
    .update(tables.userChatUsage)
    .set({
      subscriptionTier: tier,
      isAnnual,
      threadsLimit: updatedThreadsLimit,
      messagesLimit: updatedMessagesLimit,
      currentPeriodEnd, // Update period end to match subscription
      updatedAt: new Date(),
    })
    .where(eq(tables.userChatUsage.userId, userId));

  apiLogger.info('User quota synced successfully', {
    userId,
    tier,
    isAnnual,
    limits: {
      threads: updatedThreadsLimit,
      messages: updatedMessagesLimit,
    },
    currentUsage: {
      threads: currentUsage.threadsCreated,
      messages: currentUsage.messagesCreated,
    },
  });
}
