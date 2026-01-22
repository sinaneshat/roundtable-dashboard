/**
 * Participant Limits Configuration
 *
 * ✅ CLIENT-SAFE: No server-only dependencies
 * ✅ SINGLE SOURCE OF TRUTH: Shared between frontend and backend
 *
 * Defines participant count limits for chat threads.
 */

import type { SubscriptionTier } from '@roundtable/shared/enums';
import { SubscriptionTiers } from '@roundtable/shared/enums';

/**
 * Minimum participants required to send a message in the UI
 * Lowered barrier to allow single-model usage
 */
export const MIN_PARTICIPANTS_TO_SEND = 1;

/**
 * Minimum participants required for backend analyze handler
 * Backend operations require 2+ for multi-perspective analysis
 */
export const MIN_PARTICIPANTS_REQUIRED = 2;

/**
 * Maximum participants allowed per tier (absolute limit)
 * Derived from pro tier's maxModels limit
 */
export const MAX_PARTICIPANTS_LIMIT = 12;

/**
 * Example participant counts by subscription tier
 * Used by quick-start suggestions to demonstrate roundtable value
 */
export const EXAMPLE_PARTICIPANT_COUNTS = {
  [SubscriptionTiers.FREE]: 3,
  [SubscriptionTiers.PRO]: 4,
} as const satisfies Record<SubscriptionTier, number>;

export function getExampleParticipantCount(tier: SubscriptionTier): number {
  const count = EXAMPLE_PARTICIPANT_COUNTS[tier];
  return count;
}
