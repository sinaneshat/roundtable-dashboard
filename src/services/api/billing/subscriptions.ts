/**
 * Subscriptions Service - Stripe Subscriptions API
 *
 * 100% type-safe RPC service for Stripe subscription operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/api/client';
import { createApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

export type GetSubscriptionsRequest = InferRequestType<
  ApiClientType['billing']['subscriptions']['$get']
>;

export type GetSubscriptionsResponse = InferResponseType<
  ApiClientType['billing']['subscriptions']['$get']
>;

export type GetSubscriptionRequest = InferRequestType<
  ApiClientType['billing']['subscriptions'][':id']['$get']
>;

export type GetSubscriptionResponse = InferResponseType<
  ApiClientType['billing']['subscriptions'][':id']['$get']
>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Get all subscriptions for authenticated user
 * Protected endpoint - requires authentication
 */
export async function getSubscriptionsService(args?: GetSubscriptionsRequest) {
  const client = await createApiClient();
  return parseResponse(client.billing.subscriptions.$get(args ?? {}));
}

/**
 * Get a specific subscription by ID
 * Protected endpoint - requires authentication and ownership
 */
export async function getSubscriptionService(data: GetSubscriptionRequest) {
  const client = await createApiClient();
  const params: GetSubscriptionRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.billing.subscriptions[':id'].$get(params));
}
