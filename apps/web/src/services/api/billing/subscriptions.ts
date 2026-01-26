/**
 * Subscriptions Service - Stripe Subscriptions API
 *
 * 100% type-safe RPC service for Stripe subscription operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';

import type { ApiClientType } from '@/lib/api/client';
import { createApiClient, ServiceFetchError } from '@/lib/api/client';
import type { ServiceOptions } from '@/services/api/types';

// ============================================================================
// Type Inference - Endpoint definitions
// ============================================================================

type ListSubscriptionsEndpoint = ApiClientType['billing']['subscriptions']['$get'];
type GetSubscriptionEndpoint = ApiClientType['billing']['subscriptions'][':id']['$get'];

// ============================================================================
// Type Exports - Request/Response types
// ============================================================================

export type ListSubscriptionsResponse = InferResponseType<ListSubscriptionsEndpoint, 200>;
export type GetSubscriptionRequest = InferRequestType<GetSubscriptionEndpoint>;
export type GetSubscriptionResponse = InferResponseType<GetSubscriptionEndpoint, 200>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Get all subscriptions for authenticated user
 * Protected endpoint - requires authentication
 */
export async function getSubscriptionsService(options?: ServiceOptions): Promise<ListSubscriptionsResponse> {
  const client = createApiClient({
    bypassCache: options?.bypassCache,
    cookieHeader: options?.cookieHeader,
  });
  const res = await client.billing.subscriptions.$get();
  if (!res.ok) {
    throw new ServiceFetchError(`Failed to fetch subscriptions: ${res.statusText}`, res.status, res.statusText);
  }
  return res.json();
}

/**
 * Get a specific subscription by ID
 * Protected endpoint - requires authentication and ownership
 */
export async function getSubscriptionService(data: GetSubscriptionRequest): Promise<GetSubscriptionResponse> {
  const client = createApiClient();
  const res = await client.billing.subscriptions[':id'].$get(data);
  if (!res.ok) {
    throw new ServiceFetchError(`Failed to fetch subscription: ${res.statusText}`, res.status, res.statusText);
  }
  return res.json();
}

// ============================================================================
// Derived Types
// ============================================================================

type SubscriptionsSuccessData = Extract<ListSubscriptionsResponse, { success: true }> extends { data: infer D } ? D : never;
type SubscriptionItem = SubscriptionsSuccessData extends { items: (infer S)[] } ? S : never;

/**
 * Subscription - Subscription item derived from API response
 */
export type Subscription = SubscriptionItem;

// ============================================================================
// Type Guards - Accept both service response and server function result types
// ============================================================================

type SuccessResponse = Extract<ListSubscriptionsResponse, { success: true }>;

/**
 * Type guard to check if subscriptions response is successful
 * Accepts ListSubscriptionsResponse | ServerFnErrorResponse | undefined to handle both
 * direct service calls and TanStack Query results
 */
export function isSubscriptionsSuccess(response: { success: boolean; data?: unknown } | null | undefined): response is SuccessResponse {
  return response !== undefined && response !== null && response.success === true && 'data' in response;
}

/**
 * Extract subscriptions array from response safely
 * Accepts ListSubscriptionsResponse | ServerFnErrorResponse | undefined to handle both
 * direct service calls and TanStack Query results
 */
export function getSubscriptionsFromResponse(response: { success: boolean; data?: unknown } | null | undefined): Subscription[] {
  if (!isSubscriptionsSuccess(response)) {
    return [];
  }
  return response.data.items;
}
