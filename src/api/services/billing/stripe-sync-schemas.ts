/**
 * Stripe Sync Service Type Schemas
 *
 * Zod-first schemas for Stripe synchronization operations
 * Following the type-inference-patterns.md discriminated union pattern
 */

import { z } from 'zod';

import { StripeSubscriptionStatusSchema, SyncedSubscriptionStatuses } from '@/api/core/enums';

/**
 * Payment method details
 */
const PaymentMethodDetailsSchema = z.object({
  brand: z.string().nullable(),
  last4: z.string().nullable(),
});

/**
 * Active subscription state
 */
const ActiveSubscriptionStateSchema = z.object({
  status: StripeSubscriptionStatusSchema,
  subscriptionId: z.string(),
  priceId: z.string(),
  productId: z.string(),
  currentPeriodStart: z.number().int(),
  currentPeriodEnd: z.number().int(),
  cancelAtPeriodEnd: z.boolean(),
  canceledAt: z.number().int().nullable(),
  trialStart: z.number().int().nullable(),
  trialEnd: z.number().int().nullable(),
  paymentMethod: PaymentMethodDetailsSchema.nullable(),
});

/**
 * No subscription state
 */
const NoSubscriptionStateSchema = z.object({
  status: z.literal(SyncedSubscriptionStatuses.NONE),
});

/**
 * Discriminated union for synced subscription state
 * Uses 'status' as discriminator
 */
export const SyncedSubscriptionStateSchema = z.discriminatedUnion('status', [
  ActiveSubscriptionStateSchema,
  NoSubscriptionStateSchema,
]);

export type SyncedSubscriptionState = z.infer<typeof SyncedSubscriptionStateSchema>;

/**
 * Type guard for active subscription state
 */
export function hasSyncedSubscription(
  state: SyncedSubscriptionState,
): state is z.infer<typeof ActiveSubscriptionStateSchema> {
  return state.status !== SyncedSubscriptionStatuses.NONE;
}
