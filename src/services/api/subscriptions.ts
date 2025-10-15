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
 *
 * Following Hono RPC best practices: Always provide an object to $get()
 * even when all query parameters are optional. Use nullish coalescing
 * to ensure type safety.
 */
export async function getSubscriptionsService(args?: GetSubscriptionsRequest) {
  const client = await createApiClient();
  return parseResponse(client.billing.subscriptions.$get(args ?? {}));
}

/**
 * Get a specific subscription by ID
 * Protected endpoint - requires authentication and ownership
 *
 * @param data - Request with param.id for subscription ID
 */
export async function getSubscriptionService(data: GetSubscriptionRequest) {
  const client = await createApiClient();
  // Internal fallback: ensure param exists
  const params: GetSubscriptionRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.billing.subscriptions[':id'].$get(params));
}
