/**
 * Subscription Management Service - In-App Subscription Changes
 *
 * 100% type-safe RPC service for subscription switching and cancellation
 * Following Theo's "Stay Sane with Stripe" pattern - handle everything in-app
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';

import type { ApiClientType } from '@/lib/api/client';
import { createApiClient, ServiceFetchError } from '@/lib/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

type SwitchSubscriptionEndpoint = ApiClientType['billing']['billing']['subscriptions'][':id']['switch']['$post'];
export type SwitchSubscriptionRequest = InferRequestType<SwitchSubscriptionEndpoint>;
export type SwitchSubscriptionResponse = InferResponseType<SwitchSubscriptionEndpoint, 200>;

type CancelSubscriptionEndpoint = ApiClientType['billing']['billing']['subscriptions'][':id']['cancel']['$post'];
export type CancelSubscriptionRequest = InferRequestType<CancelSubscriptionEndpoint>;
export type CancelSubscriptionResponse = InferResponseType<CancelSubscriptionEndpoint, 200>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Switch subscription to a different price plan
 * Protected endpoint - requires authentication
 *
 * Automatically handles:
 * - Upgrades (new > current): Applied immediately with proration
 * - Downgrades (new < current): Applied at period end without proration
 * - Equal prices: Throws validation error
 * - Syncs fresh data from Stripe API
 */
export async function switchSubscriptionService(data: SwitchSubscriptionRequest): Promise<SwitchSubscriptionResponse> {
  const client = createApiClient();
  const res = await client.billing.billing.subscriptions[':id'].switch.$post(data);
  if (!res.ok) {
    throw new ServiceFetchError(`Failed to switch subscription: ${res.statusText}`, res.status, res.statusText);
  }
  return res.json();
}

/**
 * Cancel subscription
 * Protected endpoint - requires authentication
 *
 * - Default: Cancel at period end (user retains access)
 * - Optional: Cancel immediately (user loses access now)
 */
export async function cancelSubscriptionService(data: CancelSubscriptionRequest): Promise<CancelSubscriptionResponse> {
  const client = createApiClient();
  const res = await client.billing.billing.subscriptions[':id'].cancel.$post(data);
  if (!res.ok) {
    throw new ServiceFetchError(`Failed to cancel subscription: ${res.statusText}`, res.status, res.statusText);
  }
  return res.json();
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if cancel response is successful
 */
export function isCancelSuccess(response: CancelSubscriptionResponse | undefined): response is Extract<CancelSubscriptionResponse, { success: true }> {
  return response !== undefined && response.success === true;
}

/**
 * Type guard to check if switch response is successful
 */
export function isSwitchSuccess(response: SwitchSubscriptionResponse | undefined): response is Extract<SwitchSubscriptionResponse, { success: true }> {
  return response !== undefined && response.success === true;
}
