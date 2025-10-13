/**
 * Usage Tracking Service
 *
 * Handles chat quota tracking and enforcement for subscription tiers
 * Key features:
 * - Tracks thread and message creation (cumulative, never decremented)
 * - Enforces limits based on subscription tier
 * - Handles billing period rollover
 * - Provides usage statistics for UI display
 *
 * ✅ DYNAMIC: All quotas fetched from subscriptionTierQuotas table (database is source of truth)
 * ✅ Fallback: SUBSCRIPTION_TIER_CONFIG used only if DB query fails
 */

import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { createError } from '@/api/common/error-handling';
import type { ErrorContext } from '@/api/core';
import { apiLogger } from '@/api/middleware/hono-logger';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';
import type { SubscriptionTier } from '@/db/tables/usage';
import type { QuotaCheck, UsageStats } from '@/db/validation/usage';

// Fallback tier config for when DB query fails
const FALLBACK_TIER_QUOTAS: Record<SubscriptionTier, { threadsPerMonth: number; messagesPerMonth: number; customRolesPerMonth: number }> = {
  free: { threadsPerMonth: 2, messagesPerMonth: 20, customRolesPerMonth: 0 },
  starter: { threadsPerMonth: 30, messagesPerMonth: 150, customRolesPerMonth: 5 },
  pro: { threadsPerMonth: 75, messagesPerMonth: 400, customRolesPerMonth: 20 },
  power: { threadsPerMonth: 300, messagesPerMonth: 1800, customRolesPerMonth: -1 },
};

/**
 * Get tier quotas from database (with fallback to SUBSCRIPTION_TIER_CONFIG)
 * ✅ DYNAMIC: Fetches from subscriptionTierQuotas table
 */
async function getTierQuotas(tier: SubscriptionTier, isAnnual: boolean) {
  const db = await getDbAsync();

  const quotaConfig = await db.query.subscriptionTierQuotas.findFirst({
    where: and(
      eq(tables.subscriptionTierQuotas.tier, tier),
      eq(tables.subscriptionTierQuotas.isAnnual, isAnnual),
    ),
  });

  // Fallback to static config if DB query fails
  if (!quotaConfig) {
    apiLogger.warn('Quota config not found in DB, using fallback', { tier, isAnnual });
    return FALLBACK_TIER_QUOTAS[tier];
  }

  return {
    threadsPerMonth: quotaConfig.threadsPerMonth,
    messagesPerMonth: quotaConfig.messagesPerMonth,
    customRolesPerMonth: quotaConfig.customRolesPerMonth,
  };
}

/**
 * Get or create user usage record
 * Ensures a user has a usage tracking record for the current billing period
 */
export async function ensureUserUsageRecord(userId: string): Promise<typeof tables.userChatUsage.$inferSelect> {
  const db = await getDbAsync();

  // Check if user has existing usage record
  let usage = await db.query.userChatUsage.findFirst({
    where: eq(tables.userChatUsage.userId, userId),
  });

  const now = new Date();

  // If no usage record exists, create one with free tier defaults from DB
  if (!usage) {
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1); // First day of current month
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59); // Last day of current month

    // ✅ DYNAMIC: Fetch free tier quotas from database
    const freeTierQuotas = await getTierQuotas('free', false);

    const [newUsage] = await db
      .insert(tables.userChatUsage)
      .values({
        id: ulid(),
        userId,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        threadsCreated: 0,
        threadsLimit: freeTierQuotas.threadsPerMonth,
        messagesCreated: 0,
        messagesLimit: freeTierQuotas.messagesPerMonth,
        customRolesCreated: 0,
        customRolesLimit: freeTierQuotas.customRolesPerMonth,
        subscriptionTier: 'free',
        isAnnual: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    usage = newUsage;
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
 *
 * Following Theo's "Stay Sane with Stripe" pattern:
 * - If user has active subscription: Stripe webhooks handle period renewal
 * - If subscription ended: Downgrade to free tier and use calendar months
 * - Always archive old period before resetting
 *
 * Note: This function is primarily for handling expired subscriptions.
 * Active subscriptions get their periods updated via Stripe sync when invoice.paid fires.
 */
async function rolloverBillingPeriod(
  userId: string,
  currentUsage: typeof tables.userChatUsage.$inferSelect,
): Promise<void> {
  const db = await getDbAsync();
  const now = new Date();

  // Check if user has an active Stripe subscription
  // If currentPeriodEnd has passed and no Stripe sync updated it, subscription has ended
  const user = await db.query.user.findFirst({
    where: eq(tables.user.id, userId),
  });

  let shouldDowngradeToFree = false;

  if (user) {
    // Check if user has a Stripe customer record
    const stripeCustomer = await db.query.stripeCustomer.findFirst({
      where: eq(tables.stripeCustomer.userId, userId),
    });

    if (stripeCustomer) {
      // Check if they have an active subscription in our DB
      const activeSubscription = await db.query.stripeSubscription.findFirst({
        where: and(
          eq(tables.stripeSubscription.customerId, stripeCustomer.id),
          eq(tables.stripeSubscription.status, 'active'),
        ),
      });

      // No active subscription = downgrade to free
      shouldDowngradeToFree = !activeSubscription;
    } else {
      // No Stripe customer = free tier user
      shouldDowngradeToFree = true;
    }
  } else {
    // User not found (shouldn't happen) - default to free tier for safety
    shouldDowngradeToFree = true;
  }

  // Check if there's a pending tier change to apply
  const hasPendingTierChange = currentUsage.pendingTierChange && currentUsage.pendingTierPriceId;

  // Calculate new period (calendar-based for free tier or expired subscriptions)
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // Prepare history archive entry
  const historyInsert = db.insert(tables.userChatUsageHistory).values({
    id: ulid(),
    userId,
    periodStart: currentUsage.currentPeriodStart,
    periodEnd: currentUsage.currentPeriodEnd,
    threadsCreated: currentUsage.threadsCreated,
    threadsLimit: currentUsage.threadsLimit,
    messagesCreated: currentUsage.messagesCreated,
    messagesLimit: currentUsage.messagesLimit,
    customRolesCreated: currentUsage.customRolesCreated,
    customRolesLimit: currentUsage.customRolesLimit,
    subscriptionTier: currentUsage.subscriptionTier,
    isAnnual: currentUsage.isAnnual,
    createdAt: now,
  });

  if (hasPendingTierChange) {
    // Apply scheduled downgrade from pending tier change
    const pendingTier = currentUsage.pendingTierChange!;
    const pendingIsAnnual = currentUsage.pendingTierIsAnnual || false;

    const pendingTierQuota = await db.query.subscriptionTierQuotas.findFirst({
      where: and(
        eq(tables.subscriptionTierQuotas.tier, pendingTier),
        eq(tables.subscriptionTierQuotas.isAnnual, pendingIsAnnual),
      ),
    });

    if (pendingTierQuota) {
      const usageUpdate = db.update(tables.userChatUsage)
        .set({
          subscriptionTier: pendingTier,
          isAnnual: pendingIsAnnual,
          threadsLimit: pendingTierQuota.threadsPerMonth,
          messagesLimit: pendingTierQuota.messagesPerMonth,
          customRolesLimit: pendingTierQuota.customRolesPerMonth,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          threadsCreated: 0,
          messagesCreated: 0,
          customRolesCreated: 0,
          // Clear pending tier change fields
          pendingTierChange: null,
          pendingTierIsAnnual: null,
          pendingTierPriceId: null,
          updatedAt: now,
        })
        .where(eq(tables.userChatUsage.userId, userId));

      // ✅ ATOMIC: Archive history + Update usage in single batch (Cloudflare D1)
      if ('batch' in db && typeof db.batch === 'function') {
        await db.batch([historyInsert, usageUpdate]);
      } else {
        // Local SQLite fallback - sequential operations
        await historyInsert;
        await usageUpdate;
      }
      return; // Exit after batch
    } else {
      apiLogger.error('Pending tier quota not found, falling back to free tier', {
        userId,
        pendingTier,
        pendingIsAnnual,
      });
      shouldDowngradeToFree = true;
    }
  }

  if (shouldDowngradeToFree && !hasPendingTierChange) {
    // Downgrade to free tier
    const freeTierQuota = await db.query.subscriptionTierQuotas.findFirst({
      where: and(
        eq(tables.subscriptionTierQuotas.tier, 'free'),
        eq(tables.subscriptionTierQuotas.isAnnual, false),
      ),
    });

    const freeLimits = freeTierQuota || {
      threadsPerMonth: 2,
      messagesPerMonth: 20,
      customRolesPerMonth: 5,
    };

    const freeUpdate = db.update(tables.userChatUsage)
      .set({
        subscriptionTier: 'free',
        isAnnual: false,
        threadsLimit: freeLimits.threadsPerMonth,
        messagesLimit: freeLimits.messagesPerMonth,
        customRolesLimit: freeLimits.customRolesPerMonth,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        threadsCreated: 0,
        messagesCreated: 0,
        customRolesCreated: 0,
        // Clear any pending tier change fields
        pendingTierChange: null,
        pendingTierIsAnnual: null,
        pendingTierPriceId: null,
        updatedAt: now,
      })
      .where(eq(tables.userChatUsage.userId, userId));

    // ✅ ATOMIC: Archive history + Downgrade to free tier in single batch (Cloudflare D1)
    if ('batch' in db && typeof db.batch === 'function') {
      await db.batch([historyInsert, freeUpdate]);
    } else {
      // Local SQLite fallback - sequential operations
      await historyInsert;
      await freeUpdate;
    }
  } else if (!hasPendingTierChange) {
    // Active subscription exists but period expired
    // This shouldn't normally happen (Stripe sync should handle it)
    // Reset usage but keep current tier limits
    const resetUpdate = db.update(tables.userChatUsage)
      .set({
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        threadsCreated: 0,
        messagesCreated: 0,
        customRolesCreated: 0,
        updatedAt: now,
      })
      .where(eq(tables.userChatUsage.userId, userId));

    // ✅ ATOMIC: Archive history + Reset usage in single batch (Cloudflare D1)
    if ('batch' in db && typeof db.batch === 'function') {
      await db.batch([historyInsert, resetUpdate]);
    } else {
      // Local SQLite fallback - sequential operations
      await historyInsert;
      await resetUpdate;
    }

    apiLogger.warn('Rolled over billing period with active subscription', {
      userId,
      tier: currentUsage.subscriptionTier,
      message: 'This should be handled by Stripe sync, not rollover',
      oldPeriod: { start: currentUsage.currentPeriodStart, end: currentUsage.currentPeriodEnd },
      newPeriod: { start: periodStart, end: periodEnd },
    });
  }
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
  const customRolesRemaining = Math.max(0, usage.customRolesLimit - usage.customRolesCreated);

  const threadsPercentage = usage.threadsLimit > 0
    ? Math.round((usage.threadsCreated / usage.threadsLimit) * 100)
    : 0;

  const messagesPercentage = usage.messagesLimit > 0
    ? Math.round((usage.messagesCreated / usage.messagesLimit) * 100)
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
      pendingTierChange: usage.pendingTierChange || null,
      pendingTierIsAnnual: usage.pendingTierIsAnnual !== null ? usage.pendingTierIsAnnual : null,
    },
  };
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
 * Handles new subscriptions, upgrades, downgrades, cancellations, and billing period resets
 *
 * Following Theo's "Stay Sane with Stripe" pattern:
 * - Always sync from fresh Stripe data (via syncStripeDataFromStripe)
 * - Update billing periods to match Stripe's subscription periods
 * - Handle cancellations by preserving quotas until period end
 * - Reset usage when new billing period starts
 *
 * @param userId - User ID to update quotas for
 * @param priceId - Stripe price ID from the subscription
 * @param subscriptionStatus - Stripe subscription status ('active', 'trialing', 'canceled', etc.)
 * @param currentPeriodStart - Start date of current billing period from Stripe
 * @param currentPeriodEnd - End date of current billing period from Stripe
 */
export async function syncUserQuotaFromSubscription(
  userId: string,
  priceId: string,
  subscriptionStatus: 'active' | 'trialing' | 'canceled' | 'past_due' | 'unpaid' | 'paused' | 'none',
  currentPeriodStart: Date,
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

  // Get current usage record
  const currentUsage = await ensureUserUsageRecord(userId);

  // Determine if subscription is active (including trialing)
  const isActive = subscriptionStatus === 'active' || subscriptionStatus === 'trialing';

  // Check if billing period has changed (new period started)
  const hasPeriodChanged = currentUsage.currentPeriodEnd.getTime() !== currentPeriodEnd.getTime();
  const isPeriodReset = hasPeriodChanged && currentPeriodEnd > currentUsage.currentPeriodEnd;

  // If subscription is not active (canceled, past_due, etc.), update period tracking
  // but preserve current quotas until the period ends (Theo's pattern)
  if (!isActive) {
    // Only update the period tracking so rollover knows when to downgrade to free
    await db
      .update(tables.userChatUsage)
      .set({
        currentPeriodStart,
        currentPeriodEnd,
        updatedAt: new Date(),
      })
      .where(eq(tables.userChatUsage.userId, userId));

    return;
  }

  // Get quota configuration for the tier
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

  // Determine if this is an upgrade, downgrade, or period reset
  const oldThreadsLimit = currentUsage.threadsLimit;
  const oldMessagesLimit = currentUsage.messagesLimit;
  const newThreadsLimit = quotaConfig.threadsPerMonth;
  const newMessagesLimit = quotaConfig.messagesPerMonth;

  const isUpgrade = newThreadsLimit > oldThreadsLimit || newMessagesLimit > oldMessagesLimit;
  const isDowngrade = newThreadsLimit < oldThreadsLimit || newMessagesLimit < oldMessagesLimit;

  // Calculate quota updates based on subscription change type
  let updatedThreadsLimit = newThreadsLimit;
  let updatedMessagesLimit = newMessagesLimit;
  let updatedCustomRolesLimit = quotaConfig.customRolesPerMonth;

  // Reset usage counters if new billing period has started
  let resetUsage = {};
  if (isPeriodReset) {
    resetUsage = {
      threadsCreated: 0,
      messagesCreated: 0,
      memoriesCreated: 0,
      customRolesCreated: 0,
    };
  }

  if (isUpgrade && !isPeriodReset) {
    // UPGRADE MID-PERIOD: Add the difference to current limits (compounding)
    // User gets immediate access to higher limits
    const threadsDifference = Math.max(0, newThreadsLimit - oldThreadsLimit);
    const messagesDifference = Math.max(0, newMessagesLimit - oldMessagesLimit);

    updatedThreadsLimit = currentUsage.threadsLimit + threadsDifference;
    updatedMessagesLimit = currentUsage.messagesLimit + messagesDifference;
  } else if (isDowngrade && !isPeriodReset) {
    // DOWNGRADE MID-PERIOD: Schedule change for period end
    // Keep current quotas, set pending tier change to apply at currentPeriodEnd
    // This ensures user keeps access they paid for until period ends
    updatedThreadsLimit = oldThreadsLimit; // Keep current limits
    updatedMessagesLimit = oldMessagesLimit; // Keep current limits
    updatedCustomRolesLimit = currentUsage.customRolesLimit; // Keep current limits

    // Store pending tier change to apply at period end
    await db
      .update(tables.userChatUsage)
      .set({
        pendingTierChange: tier,
        pendingTierIsAnnual: isAnnual,
        pendingTierPriceId: priceId,
        currentPeriodStart,
        currentPeriodEnd,
        updatedAt: new Date(),
      })
      .where(eq(tables.userChatUsage.userId, userId));

    return; // Exit early - don't update tier or limits yet
  }

  // Build update operation
  const usageUpdate = db.update(tables.userChatUsage)
    .set({
      subscriptionTier: tier,
      isAnnual,
      threadsLimit: updatedThreadsLimit,
      messagesLimit: updatedMessagesLimit,
      customRolesLimit: updatedCustomRolesLimit,
      currentPeriodStart, // Always update to Stripe's billing period
      currentPeriodEnd, // Always update to Stripe's billing period
      // Clear any pending tier changes (upgrade overrides scheduled downgrade, or period has reset)
      pendingTierChange: null,
      pendingTierIsAnnual: null,
      pendingTierPriceId: null,
      ...resetUsage, // Reset usage counters if period changed
      updatedAt: new Date(),
    })
    .where(eq(tables.userChatUsage.userId, userId));

  // ✅ ATOMIC: If period reset, archive old period + update usage in single batch
  if (isPeriodReset) {
    const historyArchive = db.insert(tables.userChatUsageHistory).values({
      id: ulid(),
      userId,
      periodStart: currentUsage.currentPeriodStart,
      periodEnd: currentUsage.currentPeriodEnd,
      threadsCreated: currentUsage.threadsCreated,
      threadsLimit: currentUsage.threadsLimit,
      messagesCreated: currentUsage.messagesCreated,
      messagesLimit: currentUsage.messagesLimit,
      customRolesCreated: currentUsage.customRolesCreated,
      customRolesLimit: currentUsage.customRolesLimit,
      subscriptionTier: currentUsage.subscriptionTier,
      isAnnual: currentUsage.isAnnual,
      createdAt: new Date(),
    });

    // Execute atomically with batch (Cloudflare D1) or sequentially (local SQLite)
    if ('batch' in db && typeof db.batch === 'function') {
      await db.batch([historyArchive, usageUpdate]);
    } else {
      await historyArchive;
      await usageUpdate;
    }
  } else {
    // No period reset, just update usage
    await usageUpdate;
  }
}

// ============================================================================
// Tier Configuration Helpers (Database-Driven)
// ============================================================================

/**
 * Get maximum models allowed for a tier
 * ✅ DYNAMIC: Fetches from subscriptionTierQuotas table
 *
 * @param tier - Subscription tier
 * @param isAnnual - Whether it's an annual subscription (default: false)
 * @returns Maximum number of models allowed
 */
export async function getMaxModels(tier: SubscriptionTier, isAnnual = false): Promise<number> {
  const db = await getDbAsync();

  const quotaConfig = await db.query.subscriptionTierQuotas.findFirst({
    where: and(
      eq(tables.subscriptionTierQuotas.tier, tier),
      eq(tables.subscriptionTierQuotas.isAnnual, isAnnual),
    ),
  });

  // Fallback to default if DB query fails
  if (!quotaConfig) {
    apiLogger.warn('Max models config not found in DB, using fallback', { tier, isAnnual });
    // Fallback defaults matching previous config
    const fallbackMaxModels: Record<SubscriptionTier, number> = {
      free: 5,
      starter: 5,
      pro: 7,
      power: 15,
    };
    return fallbackMaxModels[tier];
  }

  return quotaConfig.maxAiModels;
}

/**
 * Check if user can add more models based on current count
 * ✅ DYNAMIC: Uses database configuration
 */
export async function canAddMoreModels(currentCount: number, tier: SubscriptionTier, isAnnual = false): Promise<boolean> {
  const maxModels = await getMaxModels(tier, isAnnual);
  return currentCount < maxModels;
}

/**
 * Get error message when max models limit is reached
 * ✅ DYNAMIC: Uses database configuration
 */
export async function getMaxModelsErrorMessage(tier: SubscriptionTier, isAnnual = false): Promise<string> {
  const maxModels = await getMaxModels(tier, isAnnual);
  const tierName = tier.charAt(0).toUpperCase() + tier.slice(1); // Capitalize
  return `You've reached the maximum of ${maxModels} models for the ${tierName} tier. Upgrade to add more models.`;
}
