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
 * @param options - Service options
 * @param options.bypassCache - If true, bypasses HTTP cache to get fresh data
 * @param options.cookieHeader - Pre-captured cookie header for server-side fire-and-forget prefetches
 */
export async function getSubscriptionsService(options?: {
  bypassCache?: boolean;
  cookieHeader?: string;
}) {
  const client = await createApiClient({
    bypassCache: options?.bypassCache,
    cookieHeader: options?.cookieHeader,
  });
  return parseResponse(client.billing.subscriptions.$get({}));
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
