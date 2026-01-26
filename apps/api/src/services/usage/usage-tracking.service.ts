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

import type { SubscriptionTier, SyncedSubscriptionStatus, UsageStatus } from '@roundtable/shared/enums';
import {
  BillingIntervals,
  PlanTypes,
  StripeSubscriptionStatuses,
  SubscriptionTiers,
  UsageStatuses,
} from '@roundtable/shared/enums';
import { and, eq, sql } from 'drizzle-orm';
import { ulid } from 'ulid';

import { executeBatch } from '@/common/batch-operations';
import { createError } from '@/common/error-handling';
import type { ErrorContext } from '@/core';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import { CustomerCacheTags, PriceCacheTags, SubscriptionCacheTags, UserCacheTags } from '@/db/cache/cache-tags';
import type { UserChatUsage } from '@/db/validation';
import { checkFreeUserHasCompletedRound, getTierFromProductId, getUserCreditBalance, MAX_MODELS_BY_TIER, TIER_QUOTAS, upgradeToPaidPlan } from '@/services/billing';

import type { UsageStatsPayload } from '../../routes/usage/schema';

function getTierQuotas(tier: SubscriptionTier) {
  return TIER_QUOTAS[tier];
}

export async function getUserTier(userId: string): Promise<SubscriptionTier> {
  const db = await getDbAsync();

  // ✅ CACHING: 60-second TTL - tier changes are webhook-driven and invalidate cache
  // This prevents repeated DB calls during page load (models, usage, etc.)
  const usageResults = await db
    .select()
    .from(tables.userChatUsage)
    .where(eq(tables.userChatUsage.userId, userId))
    .limit(1)
    .$withCache({
      config: { ex: 60 },
      tag: UserCacheTags.tier(userId),
    });

  return usageResults[0]?.subscriptionTier ?? SubscriptionTiers.FREE;
}

export async function ensureUserUsageRecord(userId: string): Promise<UserChatUsage> {
  const db = await getDbAsync();

  // ⚠️ NO CACHING: Usage data changes after credit transactions - must be fresh
  const usageResults = await db
    .select()
    .from(tables.userChatUsage)
    .where(eq(tables.userChatUsage.userId, userId))
    .limit(1);

  let usage = usageResults[0];

  const now = new Date();

  if (!usage) {
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    try {
      const result = await db
        .insert(tables.userChatUsage)
        .values({
          analysisGenerated: 0,
          createdAt: now,
          currentPeriodEnd: periodEnd,
          currentPeriodStart: periodStart,
          customRolesCreated: 0,
          id: ulid(),
          isAnnual: false,
          messagesCreated: 0,
          subscriptionTier: SubscriptionTiers.FREE,
          threadsCreated: 0,
          updatedAt: now,
          userId,
        })
        .returning();

      usage = result[0];

      if (!usage) {
        const retryResults = await db
          .select()
          .from(tables.userChatUsage)
          .where(eq(tables.userChatUsage.userId, userId))
          .limit(1);

        usage = retryResults[0];
      }
    } catch (error) {
      const retryResults = await db
        .select()
        .from(tables.userChatUsage)
        .where(eq(tables.userChatUsage.userId, userId))
        .limit(1);

      usage = retryResults[0];

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

  if (!usage) {
    const context: ErrorContext = {
      errorType: 'database',
      operation: 'select',
      table: 'user_chat_usage',
      userId,
    };
    throw createError.internal('Usage record unexpectedly undefined', context);
  }

  if (usage.currentPeriodEnd < now) {
    await rolloverBillingPeriod(userId, usage);

    // ⚠️ NO CACHING: Fresh read after rollover - must be accurate
    const updatedUsageResults = await db
      .select()
      .from(tables.userChatUsage)
      .where(eq(tables.userChatUsage.userId, userId))
      .limit(1);

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

async function rolloverBillingPeriod(userId: string, currentUsage: UserChatUsage): Promise<void> {
  const db = await getDbAsync();
  const now = new Date();

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
      // ⚠️ NO CACHING: Subscription status must be fresh for accurate downgrade decisions
      const activeSubscriptionResults = await db
        .select()
        .from(tables.stripeSubscription)
        .where(and(
          eq(tables.stripeSubscription.customerId, stripeCustomer.id),
          eq(tables.stripeSubscription.status, StripeSubscriptionStatuses.ACTIVE),
        ))
        .limit(1);

      const activeSubscription = activeSubscriptionResults[0];
      shouldDowngradeToFree = !activeSubscription;
    } else {
      shouldDowngradeToFree = true;
    }
  } else {
    shouldDowngradeToFree = true;
  }

  const hasPendingTierChange = !!currentUsage.pendingTierChange;
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const historyInsert = db.insert(tables.userChatUsageHistory).values({
    analysisGenerated: currentUsage.analysisGenerated,
    createdAt: now,
    customRolesCreated: currentUsage.customRolesCreated,
    id: ulid(),
    isAnnual: currentUsage.isAnnual,
    messagesCreated: currentUsage.messagesCreated,
    periodEnd: currentUsage.currentPeriodEnd,
    periodStart: currentUsage.currentPeriodStart,
    subscriptionTier: currentUsage.subscriptionTier,
    threadsCreated: currentUsage.threadsCreated,
    userId,
  });

  if (hasPendingTierChange && currentUsage.pendingTierChange) {
    const pendingTier = currentUsage.pendingTierChange;
    const pendingIsAnnual = currentUsage.pendingTierIsAnnual ?? false;

    const usageUpdate = db.update(tables.userChatUsage)
      .set({
        analysisGenerated: 0,
        currentPeriodEnd: periodEnd,
        currentPeriodStart: periodStart,
        customRolesCreated: 0,
        isAnnual: pendingIsAnnual,
        messagesCreated: 0,
        pendingTierChange: null,
        pendingTierIsAnnual: null,
        subscriptionTier: pendingTier,
        threadsCreated: 0,
        updatedAt: now,
        version: sql`${tables.userChatUsage.version} + 1`,
      })
      .where(eq(tables.userChatUsage.userId, userId));

    await executeBatch(db, [historyInsert, usageUpdate]);
    return;
  }

  if (shouldDowngradeToFree && !hasPendingTierChange) {
    const freeUpdate = db.update(tables.userChatUsage)
      .set({
        analysisGenerated: 0,
        currentPeriodEnd: periodEnd,
        currentPeriodStart: periodStart,
        customRolesCreated: 0,
        isAnnual: false,
        messagesCreated: 0,
        pendingTierChange: null,
        pendingTierIsAnnual: null,
        subscriptionTier: SubscriptionTiers.FREE,
        threadsCreated: 0,
        updatedAt: now,
        version: sql`${tables.userChatUsage.version} + 1`,
      })
      .where(eq(tables.userChatUsage.userId, userId));

    await executeBatch(db, [historyInsert, freeUpdate]);
    return;
  }

  const resetUpdate = db.update(tables.userChatUsage)
    .set({
      analysisGenerated: 0,
      currentPeriodEnd: periodEnd,
      currentPeriodStart: periodStart,
      customRolesCreated: 0,
      messagesCreated: 0,
      threadsCreated: 0,
      updatedAt: now,
      version: sql`${tables.userChatUsage.version} + 1`,
    })
    .where(eq(tables.userChatUsage.userId, userId));

  await executeBatch(db, [historyInsert, resetUpdate]);
}

export async function getUserUsageStats(userId: string): Promise<UsageStatsPayload> {
  const db = await getDbAsync();

  // ✅ PERF: Fetch all independent data in parallel
  // - creditBalance: used by both credits and plan stats
  // - usageRecord: needed for tier and pending change info
  // - customerWithSub: check active subscription
  const [creditBalance, usageRecord, customerWithSub] = await Promise.all([
    getUserCreditBalance(userId),
    ensureUserUsageRecord(userId),
    // ✅ PERF: Single JOIN query instead of 2 sequential queries
    db
      .select()
      .from(tables.stripeCustomer)
      .leftJoin(
        tables.stripeSubscription,
        and(
          eq(tables.stripeSubscription.customerId, tables.stripeCustomer.id),
          eq(tables.stripeSubscription.status, StripeSubscriptionStatuses.ACTIVE),
        ),
      )
      .where(eq(tables.stripeCustomer.userId, userId))
      .limit(1)
      .$withCache({
        config: { ex: 60 },
        tag: SubscriptionCacheTags.active(userId),
      }),
  ]);

  const hasActiveSubscription = customerWithSub.length > 0 && !!customerWithSub[0]?.stripe_subscription;
  const currentTier = usageRecord.subscriptionTier;
  const isPaidTier = currentTier !== SubscriptionTiers.FREE;

  // ✅ PERF: Only check free round for FREE users (skip expensive query for paid)
  const freeRoundUsed = isPaidTier ? false : await checkFreeUserHasCompletedRound(userId);

  // Build credits stats
  let creditStatus: UsageStatus = UsageStatuses.DEFAULT;
  if (creditBalance.available <= 0) {
    creditStatus = UsageStatuses.CRITICAL;
  } else if (creditBalance.available <= 1000) {
    creditStatus = UsageStatuses.WARNING;
  }

  // Build pending tier change info
  const pendingChange = usageRecord.pendingTierChange
    ? {
        effectiveDate: usageRecord.currentPeriodEnd.toISOString(),
        pendingTier: usageRecord.pendingTierChange,
      }
    : null;

  return {
    credits: {
      available: creditBalance.available,
      balance: creditBalance.balance,
      status: creditStatus,
    },
    plan: isPaidTier
      ? {
          freeRoundUsed: false,
          hasActiveSubscription,
          monthlyCredits: creditBalance.monthlyCredits,
          name: 'Pro',
          nextRefillAt: creditBalance.nextRefillAt?.toISOString() ?? null,
          pendingChange,
          type: 'paid' as const,
        }
      : {
          freeRoundUsed,
          hasActiveSubscription: false,
          monthlyCredits: creditBalance.monthlyCredits,
          name: 'Free',
          nextRefillAt: creditBalance.nextRefillAt?.toISOString() ?? null,
          pendingChange: null,
          type: PlanTypes.FREE,
        },
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
  subscriptionStatus: SyncedSubscriptionStatus,
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

  // Fetch product to check metadata for tier
  const productResults = await db
    .select()
    .from(tables.stripeProduct)
    .where(eq(tables.stripeProduct.id, price.productId))
    .limit(1);

  const product = productResults[0];

  // ✅ UNIFIED TIER DETECTION: Use product metadata.planType as primary source
  // Stripe products are seeded with metadata.planType='paid' for Pro plans
  // Falls back to pattern matching on product ID if metadata not available
  let tier: SubscriptionTier = SubscriptionTiers.FREE;

  if (product?.metadata) {
    try {
      const metadata = typeof product.metadata === 'string' ? JSON.parse(product.metadata) : product.metadata;
      if (metadata?.planType === PlanTypes.PAID) {
        tier = SubscriptionTiers.PRO;
      }
    } catch {
      // Fall back to pattern matching if metadata parsing fails
      tier = getTierFromProductId(price.productId);
    }
  } else {
    // No metadata available - fall back to pattern matching
    tier = getTierFromProductId(price.productId);
  }

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
        currentPeriodEnd,
        currentPeriodStart,
        updatedAt: new Date(),
        version: sql`${tables.userChatUsage.version} + 1`,
      })
      .where(eq(tables.userChatUsage.userId, userId));

    return;
  }

  // ✅ Get quota limits from CODE
  const newQuotas = getTierQuotas(tier);
  const oldQuotas = getTierQuotas(currentUsage.subscriptionTier);

  // Determine if this is a downgrade or period reset
  const isDowngrade = (newQuotas?.threadsPerMonth ?? 0) < (oldQuotas?.threadsPerMonth ?? 0)
    || (newQuotas?.messagesPerMonth ?? 0) < (oldQuotas?.messagesPerMonth ?? 0);

  // Detect upgrade from free tier to paid tier (pro)
  const isUpgradeFromFree = currentUsage.subscriptionTier === SubscriptionTiers.FREE && tier !== SubscriptionTiers.FREE;

  // Reset usage counters if new billing period has started
  let resetUsage = {};
  if (isPeriodReset) {
    resetUsage = {
      analysisGenerated: 0,
      customRolesCreated: 0,
      messagesCreated: 0,
      threadsCreated: 0,
    };
  }

  if (isDowngrade && !isPeriodReset) {
    // DOWNGRADE MID-PERIOD: Schedule change for period end
    // Keep current tier, set pending tier change to apply at currentPeriodEnd
    // This ensures user keeps access they paid for until period ends
    await db
      .update(tables.userChatUsage)
      .set({
        currentPeriodEnd,
        currentPeriodStart,
        pendingTierChange: tier,
        pendingTierIsAnnual: isAnnual,
        updatedAt: new Date(),
        version: sql`${tables.userChatUsage.version} + 1`,
      })
      .where(eq(tables.userChatUsage.userId, userId));

    return; // Exit early - don't update tier yet
  }

  // Build update operation (upgrade or period reset)
  const usageUpdate = db.update(tables.userChatUsage)
    .set({
      currentPeriodEnd, // Always update to Stripe's billing period
      currentPeriodStart, // Always update to Stripe's billing period
      isAnnual,
      // Clear any pending tier changes (upgrade overrides scheduled downgrade, or period has reset)
      pendingTierChange: null,
      pendingTierIsAnnual: null,
      subscriptionTier: tier,
      ...resetUsage, // Reset usage counters if period changed
      updatedAt: new Date(),
      version: sql`${tables.userChatUsage.version} + 1`,
    })
    .where(eq(tables.userChatUsage.userId, userId));

  // ✅ ATOMIC: If period reset, archive old period + update usage in single batch
  if (isPeriodReset) {
    // Archive historical usage (COUNTERS ONLY, no limits)
    // ✅ SINGLE SOURCE OF TRUTH: Limits calculated from subscriptionTier + TIER_QUOTAS in code
    const historyArchive = db.insert(tables.userChatUsageHistory).values({
      createdAt: new Date(),
      customRolesCreated: currentUsage.customRolesCreated,
      id: ulid(),
      isAnnual: currentUsage.isAnnual,
      messagesCreated: currentUsage.messagesCreated,
      periodEnd: currentUsage.currentPeriodEnd,
      periodStart: currentUsage.currentPeriodStart,
      // Tier identifier (look up limits from TIER_QUOTAS in code)
      subscriptionTier: currentUsage.subscriptionTier,
      // Usage counters (what actually happened)
      threadsCreated: currentUsage.threadsCreated,
      userId,
    });

    // Execute atomically with batch (Cloudflare D1) or sequentially (local SQLite)
    // Using reusable batch helper from @/api/common/batch-operations
    await executeBatch(db, [historyArchive, usageUpdate]);

    // Grant credits when upgrading from free (must happen even with period reset)
    if (isUpgradeFromFree) {
      await upgradeToPaidPlan(userId);
    }
    return;
  }

  // No period reset, just update usage
  await usageUpdate;

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
 * ✅ CODE-DRIVEN: Returns value from MAX_MODELS_BY_TIER (derived from TIER_CONFIG)
 *
 * @param tier - Subscription tier
 * @param _isAnnual - Whether it's an annual subscription (default: false) - reserved for future use
 * @returns Maximum number of models allowed
 */
export async function getMaxModels(tier: SubscriptionTier, _isAnnual = false): Promise<number> {
  return MAX_MODELS_BY_TIER[tier] ?? 3;
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
