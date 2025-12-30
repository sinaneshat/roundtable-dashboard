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
import type { StripeSubscriptionStatus, SubscriptionTier } from '@/api/core/enums';
import { BillingIntervals, CreditActions, PlanTypes, StripeSubscriptionStatuses, SubscriptionTiers } from '@/api/core/enums';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import { CustomerCacheTags, PriceCacheTags, SubscriptionCacheTags, UserCacheTags } from '@/db/cache/cache-tags';
import type { UserChatUsage } from '@/db/validation';

import type { UsageStatsPayload, UsageStatus } from '../routes/usage/schema';
import { getUserCreditBalance, upgradeToPaidPlan } from './credit.service';
import { getTierFromProductId, TIER_QUOTAS } from './product-logic.service';

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

  return usageResults[0]?.subscriptionTier || SubscriptionTiers.FREE;
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
          subscriptionTier: SubscriptionTiers.FREE,
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
        subscriptionTier: SubscriptionTiers.FREE,
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
 * ✅ CREDITS-ONLY: Simplified usage stats
 * Users only need to see their credit balance, not detailed quotas
 */
export async function getUserUsageStats(userId: string): Promise<UsageStatsPayload> {
  return {
    credits: await getCreditStatsForUsage(userId),
    plan: await getPlanStatsForUsage(userId),
  };
}

/**
 * Get credit stats for usage response
 */
async function getCreditStatsForUsage(userId: string) {
  const creditBalance = await getUserCreditBalance(userId);

  // Determine credit status based on available credits
  let creditStatus: UsageStatus = 'default';

  if (creditBalance.available <= 0) {
    creditStatus = 'critical';
  } else if (creditBalance.available <= 1000) {
    creditStatus = 'warning'; // Warning when under 1000 credits
  }

  return {
    balance: creditBalance.balance,
    available: creditBalance.available,
    status: creditStatus,
  };
}

/**
 * Get plan stats for usage response
 * ✅ Includes hasPaymentMethod to indicate if user has connected a card
 * ✅ Uses userChatUsage.subscriptionTier as source of truth (honors grace period)
 * ✅ Includes pendingTierChange info for UI to show grace period message
 *
 * hasPaymentMethod is TRUE if:
 * 1. User has an active subscription (paid users always have a card)
 * 2. User has a card_connection transaction (free users who connected card)
 */
async function getPlanStatsForUsage(userId: string) {
  const db = await getDbAsync();
  const creditBalance = await getUserCreditBalance(userId);

  // ✅ SOURCE OF TRUTH: Use userChatUsage.subscriptionTier (honors grace period)
  // This correctly maintains 'pro' tier during downgrade grace period
  const usageRecord = await ensureUserUsageRecord(userId);
  const currentTier = usageRecord.subscriptionTier;
  const isPaidTier = currentTier !== SubscriptionTiers.FREE;

  // Check for active subscription in Stripe (for hasActiveSubscription flag)
  const customerResults = await db
    .select()
    .from(tables.stripeCustomer)
    .where(eq(tables.stripeCustomer.userId, userId))
    .limit(1);

  const customer = customerResults[0];
  let hasActiveSubscription = false;

  if (customer) {
    const subscriptionResults = await db
      .select()
      .from(tables.stripeSubscription)
      .where(
        and(
          eq(tables.stripeSubscription.customerId, customer.id),
          eq(tables.stripeSubscription.status, StripeSubscriptionStatuses.ACTIVE),
        ),
      )
      .limit(1);

    hasActiveSubscription = subscriptionResults.length > 0;
  }

  // Build pending tier change info for UI grace period display
  const pendingChange = usageRecord.pendingTierChange
    ? {
        pendingTier: usageRecord.pendingTierChange,
        effectiveDate: usageRecord.currentPeriodEnd.toISOString(),
      }
    : null;

  // User on paid tier (including during grace period)
  if (isPaidTier) {
    return {
      type: 'paid' as const,
      name: 'Pro',
      monthlyCredits: creditBalance.monthlyCredits,
      hasPaymentMethod: true,
      hasActiveSubscription,
      nextRefillAt: creditBalance.nextRefillAt?.toISOString() ?? null,
      pendingChange,
    };
  }

  // For free users, check if they've connected a card via card_connection transaction
  const cardConnectionTx = await db
    .select()
    .from(tables.creditTransaction)
    .where(
      and(
        eq(tables.creditTransaction.userId, userId),
        eq(tables.creditTransaction.action, CreditActions.CARD_CONNECTION),
      ),
    )
    .limit(1);

  const hasPaymentMethod = cardConnectionTx.length > 0;

  return {
    type: PlanTypes.FREE,
    name: 'Free',
    monthlyCredits: creditBalance.monthlyCredits,
    hasPaymentMethod,
    hasActiveSubscription: false,
    nextRefillAt: creditBalance.nextRefillAt?.toISOString() ?? null,
    pendingChange: null,
  };
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

  // ✅ UNIFIED TIER DETECTION: Use product ID as primary source (CREDIT_CONFIG is single source of truth)
  // The getTierFromProductId function maps known Stripe product IDs to subscription tiers
  // Falls back to pattern matching for other product IDs, defaulting to 'free'
  const tier = getTierFromProductId(price.productId);

  const isAnnual = price.interval === BillingIntervals.YEAR;

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

  // Detect upgrade from free tier to paid tier (pro)
  const isUpgradeFromFree = currentUsage.subscriptionTier === SubscriptionTiers.FREE && tier !== SubscriptionTiers.FREE;

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

  // Grant credits when user upgrades from free tier to a paid tier
  // This ensures credits are topped up immediately on subscription upgrade
  if (isUpgradeFromFree) {
    await upgradeToPaidPlan(userId);
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
    pro: 7,
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
