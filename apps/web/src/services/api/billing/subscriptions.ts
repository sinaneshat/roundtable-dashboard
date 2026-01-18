/**
 * Subscriptions Service - Stripe Subscriptions API
 *
 * 100% type-safe RPC service for Stripe subscription operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/lib/api/client';
import { createApiClient } from '@/lib/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

type ListSubscriptionsEndpoint = ApiClientType['billing']['subscriptions']['$get'];
export type ListSubscriptionsResponse = InferResponseType<ListSubscriptionsEndpoint>;

type GetSubscriptionEndpoint = ApiClientType['billing']['subscriptions'][':id']['$get'];
export type GetSubscriptionRequest = InferRequestType<GetSubscriptionEndpoint>;
export type GetSubscriptionResponse = InferResponseType<GetSubscriptionEndpoint>;

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
  const client = createApiClient({
    bypassCache: options?.bypassCache,
    cookieHeader: options?.cookieHeader,
  });
  return parseResponse(client.billing.subscriptions.$get());
}

/**
 * Get a specific subscription by ID
 * Protected endpoint - requires authentication and ownership
 */
export async function getSubscriptionService(data: GetSubscriptionRequest) {
  const client = createApiClient();
  return parseResponse(client.billing.subscriptions[':id'].$get(data));
}
