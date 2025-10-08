/**
 * Subscription Tier Limits Configuration
 *
 * Defines resource limits and model access restrictions per subscription tier.
 * Based on cost-performance analysis and user value optimization.
 */

import type { SubscriptionTier } from '@/db/tables/usage';

/**
 * Tier Limits Configuration
 *
 * maxConcurrentModels: Maximum number of AI models that can be active in a single chat session
 * - Free: 2 models (cheapest options only)
 * - Starter: 3 models (budget-friendly options)
 * - Pro: 5 models (balanced quality/cost)
 * - Power: 8 models (premium, near-unlimited)
 */
export const TIER_LIMITS: Record<SubscriptionTier, {
  maxConcurrentModels: number;
  maxThreads: number;
  maxMessages: number;
  maxMemories: number;
  maxCustomRoles: number;
  name: string;
  description: string;
}> = {
  free: {
    maxConcurrentModels: 2,
    maxThreads: 10,
    maxMessages: 100,
    maxMemories: 5,
    maxCustomRoles: 2,
    name: 'Free',
    description: 'Basic access to 2 cheapest models',
  },
  starter: {
    maxConcurrentModels: 3,
    maxThreads: 50,
    maxMessages: 1000,
    maxMemories: 20,
    maxCustomRoles: 5,
    name: 'Starter',
    description: 'Budget-friendly models with better performance',
  },
  pro: {
    maxConcurrentModels: 5,
    maxThreads: 200,
    maxMessages: 5000,
    maxMemories: 100,
    maxCustomRoles: 20,
    name: 'Pro',
    description: 'Professional-grade models with excellent quality',
  },
  power: {
    maxConcurrentModels: 8,
    maxThreads: 1000,
    maxMessages: 50000,
    maxMemories: 500,
    maxCustomRoles: 100,
    name: 'Power',
    description: 'Flagship models with maximum capabilities',
  },
};

/**
 * Get max concurrent models allowed for a subscription tier
 */
export function getMaxConcurrentModels(tier: SubscriptionTier): number {
  return TIER_LIMITS[tier].maxConcurrentModels;
}

/**
 * Check if user can add more models to their chat session
 */
export function canAddMoreModels(
  currentModelCount: number,
  userTier: SubscriptionTier,
): boolean {
  return currentModelCount < TIER_LIMITS[userTier].maxConcurrentModels;
}

/**
 * Get user-friendly error message when max models exceeded
 */
export function getMaxModelsErrorMessage(userTier: SubscriptionTier): string {
  const limit = TIER_LIMITS[userTier].maxConcurrentModels;
  const tierName = TIER_LIMITS[userTier].name;

  if (userTier === 'free') {
    return `Your ${tierName} plan allows up to ${limit} models per chat. Upgrade to Starter ($9/mo) for 3 models.`;
  }
  if (userTier === 'starter') {
    return `Your ${tierName} plan allows up to ${limit} models per chat. Upgrade to Pro ($29/mo) for 5 models.`;
  }
  if (userTier === 'pro') {
    return `Your ${tierName} plan allows up to ${limit} models per chat. Upgrade to Power ($99/mo) for 8 models.`;
  }
  return `Your ${tierName} plan allows up to ${limit} models per chat.`;
}
