/**
 * Subscription Tier Display Names
 *
 * ✅ SINGLE SOURCE OF TRUTH: Display names for subscription tiers
 * ✅ CLIENT-SAFE: No server-only dependencies
 *
 * Used by both API and web packages for consistent tier labeling.
 */

import type { SubscriptionTier } from '../enums/billing';
import { SubscriptionTiers } from '../enums/billing';

/**
 * Human-readable names for subscription tiers
 * Used in UI for tier badges, upgrade prompts, API responses, etc.
 */
export const SUBSCRIPTION_TIER_NAMES: Record<SubscriptionTier, string> = {
  [SubscriptionTiers.FREE]: 'Free',
  [SubscriptionTiers.PRO]: 'Pro',
} as const;

/**
 * Get display name for a subscription tier
 */
export function getTierDisplayName(tier: SubscriptionTier): string {
  return SUBSCRIPTION_TIER_NAMES[tier];
}
