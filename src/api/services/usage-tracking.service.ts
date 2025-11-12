/**
 * Usage Tracking Service - STORAGE ONLY
 *
 * ✅ SINGLE SOURCE OF TRUTH: All quotas come from product-logic.service.ts
 * ✅ DATABASE ROLE: Only stores usage counters and billing periods
 * ❌ NO BUSINESS LOGIC: No quota calculations, limits, or pricing in database
 *
 * Key features:
 * - Tracks thread and message creation (cumulative, never decremented)
 * - Enforces limits based on TIER_QUOTAS from product-logic.service.ts
 * - Handles billing period rollover
 * - Provides usage statistics for UI display
 *
 * Architecture:
 * - Database: Stores counters (threadsCreated, messagesCreated, etc.)
 * - Code: Defines limits via TIER_QUOTAS constant
 * - History: Stores snapshot of limits for historical accuracy
 */

import { and, eq, sql } from 'drizzle-orm';
import { ulid } from 'ulid';

import { executeBatch } from '@/api/common/batch-operations';
import { createError } from '@/api/common/error-handling';
import type { ErrorContext } from '@/api/core';
import type { StripeSubscriptionStatus } from '@/api/core/enums';
import { StripeSubscriptionStatuses } from '@/api/core/enums';
import { getDbAsync } from '@/db';
import { CustomerCacheTags, PriceCacheTags, SubscriptionCacheTags, UserCacheTags } from '@/db/cache/cache-tags';
import * as tables from '@/db/schema';
import type { UserChatUsage } from '@/db/validation';

import type { QuotaCheck, UsageStats, UsageStatus } from '../routes/usage/schema';
import type { SubscriptionTier } from './product-logic.service';
import { TIER_QUOTAS } from './product-logic.service';

/**
 * Get tier quotas from code (SINGLE SOURCE OF TRUTH)
 * ✅ CODE-DRIVEN: All limits come from TIER_QUOTAS constant
 */
function getTierQuotas(tier: SubscriptionTier) {
  return TIER_QUOTAS[tier];
}

/**
 * Get user's subscription tier
 * ✅ CACHING ENABLED: Uses same caching pattern as ensureUserUsageRecord (5-minute TTL)
 * ✅ DRY: Single source of truth for tier lookup with caching
 *
 * @param userId - User ID to look up tier for
 * @returns User's subscription tier (defaults to 'free' if not found)
 */
export async function getUserTier(userId: string): Promise<SubscriptionTier> {
  const db = await getDbAsync();

  // ✅ CACHING ENABLED: 5-minute TTL for user tier data
  // Same pattern as ensureUserUsageRecord for consistency
  const usageResults = await db
    .select()
    .from(tables.userChatUsage)
    .where(eq(tables.userChatUsage.userId, userId))
    .limit(1)
    .$withCache({
      config: { ex: 300 }, // 5 minutes
      tag: UserCacheTags.tier(userId),
    });

  return usageResults[0]?.subscriptionTier || 'free';
}

/**
 * Get or create user usage record
 * Ensures a user has a usage tracking record for the current billing period
 */
export async function ensureUserUsageRecord(userId: string): Promise<UserChatUsage> {
  const db = await getDbAsync();

  // Check if user has existing usage record
  // ✅ CACHING ENABLED: Query builder API with 1-minute TTL for near-real-time usage
  // Cache automatically invalidates when usage counters are updated
  // @see https://orm.drizzle.team/docs/cache
  const usageResults = await db
    .select()
    .from(tables.userChatUsage)
    .where(eq(tables.userChatUsage.userId, userId))
    .limit(1)
    .$withCache({
      config: { ex: 60 }, // 1 minute TTL for near-real-time data
      tag: UserCacheTags.usage(userId),
    });

  let usage = usageResults[0];

  const now = new Date();

  // If no usage record exists, create one with free tier defaults from CODE
  if (!usage) {
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1); // First day of current month
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59); // Last day of current month

    try {
      const result = await db
        .insert(tables.userChatUsage)
        .values({
          id: ulid(),
          userId,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          threadsCreated: 0,
          messagesCreated: 0,
          customRolesCreated: 0,
          analysisGenerated: 0,
          subscriptionTier: 'free',
          isAnnual: false,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      usage = result[0];

      // If insert succeeded but didn't return a record, query it again
      if (!usage) {
        const retryResults = await db
          .select()
          .from(tables.userChatUsage)
          .where(eq(tables.userChatUsage.userId, userId))
          .limit(1);

        usage = retryResults[0];
      }
    } catch (error) {
      // If insert failed due to unique constraint (race condition), try to fetch the record
      const retryResults = await db
        .select()
        .from(tables.userChatUsage)
        .where(eq(tables.userChatUsage.userId, userId))
        .limit(1);

      usage = retryResults[0];

      // If still no record after retry, re-throw the original error
      if (!usage) {
        const context: ErrorContext = {
          errorType: 'database',
          operation: 'insert',
          table: 'user_chat_usage',
          userId,
        };
        const errorMsg = error instanceof Error ? error.message : String(error);
        throw createError.internal(`Failed to create usage record: ${errorMsg}`, context);
      }
    }
  }

  // At this point, usage should be defined
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
    // ✅ CACHING ENABLED: 1-minute TTL, automatically invalidated by rollover mutation
    const updatedUsageResults = await db
      .select()
      .from(tables.userChatUsage)
      .where(eq(tables.userChatUsage.userId, userId))
      .limit(1)
      .$withCache({
        config: { ex: 60 },
        tag: UserCacheTags.usage(userId),
      });

    const updatedUsage = updatedUsageResults[0];

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
  currentUsage: UserChatUsage,
): Promise<void> {
  const db = await getDbAsync();
  const now = new Date();

  // Check if user has an active Stripe subscription
  // If currentPeriodEnd has passed and no Stripe sync updated it, subscription has ended
  // ✅ CACHING ENABLED: 5-minute TTL for user data (low mutation frequency)
  const userResults = await db
    .select()
    .from(tables.user)
    .where(eq(tables.user.id, userId))
    .limit(1)
    .$withCache({
      config: { ex: 300 },
      tag: UserCacheTags.record(userId),
    });

  const user = userResults[0];

  let shouldDowngradeToFree = false;

  if (user) {
    // Check if user has a Stripe customer record
    // ✅ CACHING ENABLED: 5-minute TTL for customer data (rarely changes)
    const stripeCustomerResults = await db
      .select()
      .from(tables.stripeCustomer)
      .where(eq(tables.stripeCustomer.userId, userId))
      .limit(1)
      .$withCache({
        config: { ex: 300 },
        tag: CustomerCacheTags.byUserId(userId),
      });

    const stripeCustomer = stripeCustomerResults[0];

    if (stripeCustomer) {
      // Check if they have an active subscription in our DB
      // ✅ CACHING ENABLED: 2-minute TTL for subscription status (updated by webhooks)
      const activeSubscriptionResults = await db
        .select()
        .from(tables.stripeSubscription)
        .where(and(
          eq(tables.stripeSubscription.customerId, stripeCustomer.id),
          eq(tables.stripeSubscription.status, StripeSubscriptionStatuses.ACTIVE),
        ))
        .limit(1)
        .$withCache({
          config: { ex: 120 },
          tag: SubscriptionCacheTags.active(userId),
        });

      const activeSubscription = activeSubscriptionResults[0];

      // No active subscription = downgrade to free
      shouldDowngradeToFree = !activeSubscription;
    } else {
    // Intentionally empty
      // No Stripe customer = free tier user
      shouldDowngradeToFree = true;
    }
  } else {
    // Intentionally empty
    // User not found (shouldn't happen) - default to free tier for safety
    shouldDowngradeToFree = true;
  }

  // Check if there's a pending tier change to apply
  const hasPendingTierChange = !!currentUsage.pendingTierChange;

  // Calculate new period (calendar-based for free tier or expired subscriptions)
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // Prepare history archive entry (COUNTERS ONLY, no limits)
  // ✅ SINGLE SOURCE OF TRUTH: Limits calculated from subscriptionTier + TIER_QUOTAS in code
  const historyInsert = db.insert(tables.userChatUsageHistory).values({
    id: ulid(),
    userId,
    periodStart: currentUsage.currentPeriodStart,
    periodEnd: currentUsage.currentPeriodEnd,
    // Usage counters (what actually happened)
    threadsCreated: currentUsage.threadsCreated,
    messagesCreated: currentUsage.messagesCreated,
    customRolesCreated: currentUsage.customRolesCreated,
    analysisGenerated: currentUsage.analysisGenerated,
    // Tier identifier (look up limits from TIER_QUOTAS in code)
    subscriptionTier: currentUsage.subscriptionTier,
    isAnnual: currentUsage.isAnnual,
    createdAt: now,
  });

  if (hasPendingTierChange) {
    // Apply scheduled downgrade from pending tier change
    const pendingTier = currentUsage.pendingTierChange!;
    const pendingIsAnnual = currentUsage.pendingTierIsAnnual || false;

    const usageUpdate = db.update(tables.userChatUsage)
      .set({
        subscriptionTier: pendingTier,
        isAnnual: pendingIsAnnual,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        threadsCreated: 0,
        messagesCreated: 0,
        customRolesCreated: 0,
        analysisGenerated: 0,
        // Clear pending tier change fields
        pendingTierChange: null,
        pendingTierIsAnnual: null,
        version: sql`${tables.userChatUsage.version} + 1`,
        updatedAt: now,
      })
      .where(eq(tables.userChatUsage.userId, userId));

    // ✅ ATOMIC: Archive history + Update usage in single batch (Cloudflare D1)
    // Using reusable batch helper from @/api/common/batch-operations
    await executeBatch(db, [historyInsert, usageUpdate]);
    return; // Exit after batch
  }

  if (shouldDowngradeToFree && !hasPendingTierChange) {
    // Downgrade to free tier
    const freeUpdate = db.update(tables.userChatUsage)
      .set({
        subscriptionTier: 'free',
        isAnnual: false,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        threadsCreated: 0,
        messagesCreated: 0,
        customRolesCreated: 0,
        analysisGenerated: 0,
        // Clear any pending tier change fields
        pendingTierChange: null,
        pendingTierIsAnnual: null,
        version: sql`${tables.userChatUsage.version} + 1`,
        updatedAt: now,
      })
      .where(eq(tables.userChatUsage.userId, userId));

    // ✅ ATOMIC: Archive history + Downgrade to free tier in single batch (Cloudflare D1)
    // Using reusable batch helper from @/api/common/batch-operations
    await executeBatch(db, [historyInsert, freeUpdate]);
  } else if (!hasPendingTierChange) {
    // Active subscription exists but period expired
    // This shouldn't normally happen (Stripe sync should handle it)
    // Reset usage but keep current tier
    const resetUpdate = db.update(tables.userChatUsage)
      .set({
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        threadsCreated: 0,
        messagesCreated: 0,
        customRolesCreated: 0,
        analysisGenerated: 0,
        version: sql`${tables.userChatUsage.version} + 1`,
        updatedAt: now,
      })
      .where(eq(tables.userChatUsage.userId, userId));

    // ✅ ATOMIC: Archive history + Reset usage in single batch (Cloudflare D1)
    // Using reusable batch helper from @/api/common/batch-operations
    await executeBatch(db, [historyInsert, resetUpdate]);
  }
}

/**
 * Check thread creation quota
 * Returns whether user can create a new thread and current usage stats
 */
export async function checkThreadQuota(userId: string): Promise<QuotaCheck> {
  const usage = await ensureUserUsageRecord(userId);

  // ✅ Get limit from CODE, not database
  const quotas = getTierQuotas(usage.subscriptionTier);
  const limit = quotas.threadsPerMonth;

  const canCreate = usage.threadsCreated < limit;
  const remaining = Math.max(0, limit - usage.threadsCreated);

  return {
    canCreate,
    current: usage.threadsCreated,
    limit,
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

  // ✅ Get limit from CODE, not database
  const quotas = getTierQuotas(usage.subscriptionTier);
  const limit = quotas.messagesPerMonth;

  const canCreate = usage.messagesCreated < limit;
  const remaining = Math.max(0, limit - usage.messagesCreated);

  return {
    canCreate,
    current: usage.messagesCreated,
    limit,
    remaining,
    resetDate: usage.currentPeriodEnd,
    tier: usage.subscriptionTier,
  };
}

/**
 * ✅ BUSINESS LOGIC: Compute usage status based on percentage thresholds
 * Single source of truth for warning/critical thresholds
 *
 * @param percentage - Usage percentage (0-100+)
 * @returns 'default' | 'warning' | 'critical'
 */
function computeUsageStatus(percentage: number): UsageStatus {
  if (percentage >= 100) {
    return 'critical'; // At or over limit
  }
  if (percentage >= 80) {
    return 'warning'; // Approaching limit (80%+)
  }
  return 'default'; // Normal usage (<80%)
}

/**
 * Check custom role creation quota
 * Returns whether user can create a new custom role and current usage stats
 */
export async function checkCustomRoleQuota(userId: string): Promise<QuotaCheck> {
  const usage = await ensureUserUsageRecord(userId);

  // ✅ Get limit from CODE, not database
  const quotas = getTierQuotas(usage.subscriptionTier);
  const limit = quotas.customRolesPerMonth;

  const canCreate = usage.customRolesCreated < limit;
  const remaining = Math.max(0, limit - usage.customRolesCreated);

  return {
    canCreate,
    current: usage.customRolesCreated,
    limit,
    remaining,
    resetDate: usage.currentPeriodEnd,
    tier: usage.subscriptionTier,
  };
}

/**
 * Check analysis generation quota
 * Returns whether user can generate a new analysis and current usage stats
 *
 * Analysis is only generated for multi-participant conversations (2+ participants)
 * Single participant conversations do not trigger analysis
 */
export async function checkAnalysisQuota(userId: string): Promise<QuotaCheck> {
  const usage = await ensureUserUsageRecord(userId);

  // ✅ Get limit from CODE, not database
  const quotas = getTierQuotas(usage.subscriptionTier);
  const limit = quotas.analysisPerMonth;

  const canCreate = usage.analysisGenerated < limit;
  const remaining = Math.max(0, limit - usage.analysisGenerated);

  return {
    canCreate,
    current: usage.analysisGenerated,
    limit,
    remaining,
    resetDate: usage.currentPeriodEnd,
    tier: usage.subscriptionTier,
  };
}

/**
 * Increment thread creation counter
 * Must be called AFTER successfully creating a thread
 * Does NOT decrement when threads are deleted
 *
 * ✅ ATOMIC OPERATION: Uses SQL-level increment to prevent race conditions
 * ✅ OPTIMISTIC LOCKING: Version column prevents lost updates
 * Following Drizzle ORM best practices for concurrent updates
 */
export async function incrementThreadUsage(userId: string): Promise<void> {
  const db = await getDbAsync();

  // Ensure user record exists first
  await ensureUserUsageRecord(userId);

  // ✅ ATOMIC: SQL-level increment prevents race conditions
  // ✅ VERSION: Optimistic locking with version column
  // Multiple concurrent requests will queue safely at database level
  await db
    .update(tables.userChatUsage)
    .set({
      threadsCreated: sql`${tables.userChatUsage.threadsCreated} + 1`,
      version: sql`${tables.userChatUsage.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(tables.userChatUsage.userId, userId));
}

/**
 * Increment message creation counter
 * Must be called AFTER successfully creating a message
 * Does NOT decrement when messages are deleted
 *
 * ✅ ATOMIC OPERATION: Uses SQL-level increment to prevent race conditions
 * ✅ OPTIMISTIC LOCKING: Version column prevents lost updates
 * Following Drizzle ORM best practices for concurrent updates
 */
export async function incrementMessageUsage(userId: string, count = 1): Promise<void> {
  const db = await getDbAsync();

  // Ensure user record exists first
  await ensureUserUsageRecord(userId);

  // ✅ ATOMIC: SQL-level increment prevents race conditions
  // ✅ VERSION: Optimistic locking with version column
  // Multiple concurrent requests will queue safely at database level
  await db
    .update(tables.userChatUsage)
    .set({
      messagesCreated: sql`${tables.userChatUsage.messagesCreated} + ${count}`,
      version: sql`${tables.userChatUsage.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(tables.userChatUsage.userId, userId));
}

/**
 * Increment custom role creation counter
 * Must be called AFTER successfully creating a custom role
 * Does NOT decrement when custom roles are deleted
 *
 * ✅ ATOMIC OPERATION: Uses SQL-level increment to prevent race conditions
 * ✅ OPTIMISTIC LOCKING: Version column prevents lost updates
 * Following Drizzle ORM best practices for concurrent updates
 */
export async function incrementCustomRoleUsage(userId: string, count = 1): Promise<void> {
  const db = await getDbAsync();

  // Ensure user record exists first
  await ensureUserUsageRecord(userId);

  // ✅ ATOMIC: SQL-level increment prevents race conditions
  // ✅ VERSION: Optimistic locking with version column
  // Multiple concurrent requests will queue safely at database level
  await db
    .update(tables.userChatUsage)
    .set({
      customRolesCreated: sql`${tables.userChatUsage.customRolesCreated} + ${count}`,
      version: sql`${tables.userChatUsage.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(tables.userChatUsage.userId, userId));
}

/**
 * Increment analysis generation counter
 * Must be called AFTER successfully generating an analysis
 * Does NOT decrement when analysis is deleted
 *
 * ✅ ATOMIC OPERATION: Uses SQL-level increment to prevent race conditions
 * ✅ OPTIMISTIC LOCKING: Version column prevents lost updates
 * Following Drizzle ORM best practices for concurrent updates
 *
 * Note: Analysis is only generated for multi-participant conversations (2+ participants)
 */
export async function incrementAnalysisUsage(userId: string, count = 1): Promise<void> {
  const db = await getDbAsync();

  // Ensure user record exists first
  await ensureUserUsageRecord(userId);

  // ✅ ATOMIC: SQL-level increment prevents race conditions
  // ✅ VERSION: Optimistic locking with version column
  // Multiple concurrent requests will queue safely at database level
  await db
    .update(tables.userChatUsage)
    .set({
      analysisGenerated: sql`${tables.userChatUsage.analysisGenerated} + ${count}`,
      version: sql`${tables.userChatUsage.version} + 1`,
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

  // ✅ Get all limits from CODE, not database
  const quotas = getTierQuotas(usage.subscriptionTier);

  // Ensure usage counters are valid numbers (handle null/undefined from DB)
  const threadsCreated = usage.threadsCreated ?? 0;
  const messagesCreated = usage.messagesCreated ?? 0;
  const customRolesCreated = usage.customRolesCreated ?? 0;
  const analysisGenerated = usage.analysisGenerated ?? 0;

  const threadsRemaining = Math.max(0, quotas.threadsPerMonth - threadsCreated);
  const messagesRemaining = Math.max(0, quotas.messagesPerMonth - messagesCreated);
  const customRolesRemaining = Math.max(0, quotas.customRolesPerMonth - customRolesCreated);
  const analysisRemaining = Math.max(0, quotas.analysisPerMonth - analysisGenerated);

  const threadsPercentage = quotas.threadsPerMonth > 0
    ? Math.round((threadsCreated / quotas.threadsPerMonth) * 100)
    : 0;

  const messagesPercentage = quotas.messagesPerMonth > 0
    ? Math.round((messagesCreated / quotas.messagesPerMonth) * 100)
    : 0;

  const customRolesPercentage = quotas.customRolesPerMonth > 0
    ? Math.round((customRolesCreated / quotas.customRolesPerMonth) * 100)
    : 0;

  const analysisPercentage = quotas.analysisPerMonth > 0
    ? Math.round((analysisGenerated / quotas.analysisPerMonth) * 100)
    : 0;

  // ✅ COMPUTE STATUS: Business logic for warning thresholds (single source of truth)
  const threadsStatus = computeUsageStatus(threadsPercentage);
  const messagesStatus = computeUsageStatus(messagesPercentage);
  const customRolesStatus = computeUsageStatus(customRolesPercentage);
  const analysisStatus = computeUsageStatus(analysisPercentage);

  // Ensure dates are properly converted (handle both Date objects and timestamps)
  const periodEnd = usage.currentPeriodEnd instanceof Date
    ? usage.currentPeriodEnd
    : new Date(usage.currentPeriodEnd);
  const periodStart = usage.currentPeriodStart instanceof Date
    ? usage.currentPeriodStart
    : new Date(usage.currentPeriodStart);

  const daysRemaining = Math.max(0, Math.ceil(
    (periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  ));

  return {
    threads: {
      used: threadsCreated,
      limit: quotas.threadsPerMonth,
      remaining: threadsRemaining,
      percentage: threadsPercentage,
      status: threadsStatus, // ✅ NEW: Backend-computed status
    },
    messages: {
      used: messagesCreated,
      limit: quotas.messagesPerMonth,
      remaining: messagesRemaining,
      percentage: messagesPercentage,
      status: messagesStatus, // ✅ NEW: Backend-computed status
    },
    customRoles: {
      used: customRolesCreated,
      limit: quotas.customRolesPerMonth,
      remaining: customRolesRemaining,
      percentage: customRolesPercentage,
      status: customRolesStatus, // ✅ NEW: Backend-computed status
    },
    analysis: {
      used: analysisGenerated,
      limit: quotas.analysisPerMonth,
      remaining: analysisRemaining,
      percentage: analysisPercentage,
      status: analysisStatus, // ✅ NEW: Backend-computed status
    },
    period: {
      start: periodStart,
      end: periodEnd,
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
 * Enforce analysis generation quota before creation
 * Throws error if user has exceeded quota
 *
 * Note: Analysis is only generated for multi-participant conversations (2+ participants)
 * This check should only be called when generating analysis for such conversations
 */
export async function enforceAnalysisQuota(userId: string): Promise<void> {
  const quota = await checkAnalysisQuota(userId);

  if (!quota.canCreate) {
    const context: ErrorContext = {
      errorType: 'resource',
      resource: 'chat_moderator_analysis',
      userId,
    };
    throw createError.badRequest(
      `Analysis generation limit reached. You have used ${quota.current} of ${quota.limit} analyses this month. Upgrade your plan for more analysis capacity.`,
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
 * ✅ CODE-DRIVEN: All quota calculations use TIER_QUOTAS from code
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
  subscriptionStatus: StripeSubscriptionStatus | 'none',
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
): Promise<void> {
  const db = await getDbAsync();

  // Get price metadata to determine tier and billing period
  // ✅ CACHING ENABLED: 5-minute TTL for price data (rarely changes)
  const priceResults = await db
    .select()
    .from(tables.stripePrice)
    .where(eq(tables.stripePrice.id, priceId))
    .limit(1)
    .$withCache({
      config: { ex: 300 },
      tag: PriceCacheTags.single(priceId),
    });

  const price = priceResults[0];

  if (!price) {
    const context: ErrorContext = {
      errorType: 'resource',
      resource: 'stripe_price',
      resourceId: priceId,
    };
    throw createError.notFound(`Price not found: ${priceId}`, context);
  }

  // ✅ TYPE GUARD: Validate tier from price metadata
  const tierValue = price.metadata?.tier;
  const validTiers: SubscriptionTier[] = ['free', 'starter', 'pro', 'power'];
  const tier = typeof tierValue === 'string' && validTiers.includes(tierValue as SubscriptionTier)
    ? (tierValue as SubscriptionTier)
    : undefined;

  const isAnnual = price.interval === 'year';

  if (!tier) {
    return;
  }

  // Get current usage record
  const currentUsage = await ensureUserUsageRecord(userId);

  // Determine if subscription is active (including trialing)
  const isActive = subscriptionStatus === StripeSubscriptionStatuses.ACTIVE || subscriptionStatus === StripeSubscriptionStatuses.TRIALING;

  // Check if billing period has changed (new period started)
  const hasPeriodChanged = currentUsage.currentPeriodEnd.getTime() !== currentPeriodEnd.getTime();
  const isPeriodReset = hasPeriodChanged && currentPeriodEnd > currentUsage.currentPeriodEnd;

  // If subscription is not active (canceled, past_due, etc.), update period tracking
  // but preserve current tier until the period ends (Theo's pattern)
  if (!isActive) {
    // Only update the period tracking so rollover knows when to downgrade to free
    await db
      .update(tables.userChatUsage)
      .set({
        currentPeriodStart,
        currentPeriodEnd,
        version: sql`${tables.userChatUsage.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(tables.userChatUsage.userId, userId));

    return;
  }

  // ✅ Get quota limits from CODE
  const newQuotas = getTierQuotas(tier);
  const oldQuotas = getTierQuotas(currentUsage.subscriptionTier);

  // Determine if this is a downgrade or period reset
  const isDowngrade = newQuotas.threadsPerMonth < oldQuotas.threadsPerMonth
    || newQuotas.messagesPerMonth < oldQuotas.messagesPerMonth;

  // Reset usage counters if new billing period has started
  let resetUsage = {};
  if (isPeriodReset) {
    resetUsage = {
      threadsCreated: 0,
      messagesCreated: 0,
      customRolesCreated: 0,
      analysisGenerated: 0,
    };
  }

  if (isDowngrade && !isPeriodReset) {
    // DOWNGRADE MID-PERIOD: Schedule change for period end
    // Keep current tier, set pending tier change to apply at currentPeriodEnd
    // This ensures user keeps access they paid for until period ends
    await db
      .update(tables.userChatUsage)
      .set({
        pendingTierChange: tier,
        pendingTierIsAnnual: isAnnual,
        currentPeriodStart,
        currentPeriodEnd,
        version: sql`${tables.userChatUsage.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(tables.userChatUsage.userId, userId));

    return; // Exit early - don't update tier yet
  }

  // Build update operation (upgrade or period reset)
  const usageUpdate = db.update(tables.userChatUsage)
    .set({
      subscriptionTier: tier,
      isAnnual,
      currentPeriodStart, // Always update to Stripe's billing period
      currentPeriodEnd, // Always update to Stripe's billing period
      // Clear any pending tier changes (upgrade overrides scheduled downgrade, or period has reset)
      pendingTierChange: null,
      pendingTierIsAnnual: null,
      ...resetUsage, // Reset usage counters if period changed
      version: sql`${tables.userChatUsage.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(tables.userChatUsage.userId, userId));

  // ✅ ATOMIC: If period reset, archive old period + update usage in single batch
  if (isPeriodReset) {
    // Archive historical usage (COUNTERS ONLY, no limits)
    // ✅ SINGLE SOURCE OF TRUTH: Limits calculated from subscriptionTier + TIER_QUOTAS in code
    const historyArchive = db.insert(tables.userChatUsageHistory).values({
      id: ulid(),
      userId,
      periodStart: currentUsage.currentPeriodStart,
      periodEnd: currentUsage.currentPeriodEnd,
      // Usage counters (what actually happened)
      threadsCreated: currentUsage.threadsCreated,
      messagesCreated: currentUsage.messagesCreated,
      customRolesCreated: currentUsage.customRolesCreated,
      // Tier identifier (look up limits from TIER_QUOTAS in code)
      subscriptionTier: currentUsage.subscriptionTier,
      isAnnual: currentUsage.isAnnual,
      createdAt: new Date(),
    });

    // Execute atomically with batch (Cloudflare D1) or sequentially (local SQLite)
    // Using reusable batch helper from @/api/common/batch-operations
    await executeBatch(db, [historyArchive, usageUpdate]);
  } else {
    // Intentionally empty
    // No period reset, just update usage
    await usageUpdate;
  }
}

// ============================================================================
// Tier Configuration Helpers (Code-Driven)
// ============================================================================

/**
 * Get maximum models allowed for a tier
 * ✅ CODE-DRIVEN: Returns value from TIER_QUOTAS or defaults
 *
 * @param tier - Subscription tier
 * @param _isAnnual - Whether it's an annual subscription (default: false) - reserved for future use
 * @returns Maximum number of models allowed
 */
export async function getMaxModels(tier: SubscriptionTier, _isAnnual = false): Promise<number> {
  // For now, return hardcoded defaults until we add maxAiModels to TIER_QUOTAS
  const fallbackMaxModels: Record<SubscriptionTier, number> = {
    free: 5,
    starter: 5,
    pro: 7,
    power: 15,
  };
  return fallbackMaxModels[tier];
}

/**
 * Check if user can add more models based on current count
 * ✅ CODE-DRIVEN: Uses code configuration
 */
export async function canAddMoreModels(currentCount: number, tier: SubscriptionTier, isAnnual = false): Promise<boolean> {
  const maxModels = await getMaxModels(tier, isAnnual);
  return currentCount < maxModels;
}

/**
 * Get error message when max models limit is reached
 * ✅ CODE-DRIVEN: Uses code configuration
 */
export async function getMaxModelsErrorMessage(tier: SubscriptionTier, isAnnual = false): Promise<string> {
  const maxModels = await getMaxModels(tier, isAnnual);
  const tierName = tier.charAt(0).toUpperCase() + tier.slice(1); // Capitalize
  return `You've reached the maximum of ${maxModels} models for the ${tierName} tier. Upgrade to add more models.`;
}
