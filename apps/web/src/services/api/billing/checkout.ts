/**
 * Checkout Service - Stripe Checkout API
 *
 * 100% type-safe RPC service for Stripe checkout operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';

import type { ApiClientType } from '@/lib/api/client';
import { createApiClient, ServiceFetchError } from '@/lib/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

type CreateCheckoutEndpoint = ApiClientType['billing']['billing']['checkout']['$post'];
export type CreateCheckoutSessionRequest = InferRequestType<CreateCheckoutEndpoint>;
export type CreateCheckoutSessionResponse = InferResponseType<CreateCheckoutEndpoint, 200>;

type SyncAfterCheckoutEndpoint = ApiClientType['billing']['billing']['sync-after-checkout']['$post'];
export type SyncAfterCheckoutRequest = InferRequestType<SyncAfterCheckoutEndpoint>;
export type SyncAfterCheckoutResponse = InferResponseType<SyncAfterCheckoutEndpoint, 200>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Create Stripe checkout session for subscription purchase
 * Protected endpoint - requires authentication
 */
export async function createCheckoutSessionService(data: CreateCheckoutSessionRequest): Promise<CreateCheckoutSessionResponse> {
  const client = createApiClient();
  const res = await client.billing.billing.checkout.$post(data);
  if (!res.ok) {
    throw new ServiceFetchError(`Failed to create checkout session: ${res.statusText}`, res.status, res.statusText);
  }
  return res.json();
}

/**
 * Sync Stripe data after successful checkout
 * Protected endpoint - requires authentication
 *
 * Theo's "Stay Sane with Stripe" pattern:
 * Eagerly fetches fresh subscription data from Stripe API immediately after checkout
 * to prevent race conditions with webhooks
 */
export async function syncAfterCheckoutService(data?: SyncAfterCheckoutRequest): Promise<SyncAfterCheckoutResponse> {
  const client = createApiClient();
  const res = await client.billing.billing['sync-after-checkout'].$post(data ?? {});
  if (!res.ok) {
    throw new ServiceFetchError(`Failed to sync after checkout: ${res.statusText}`, res.status, res.statusText);
  }
  return res.json();
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if checkout response is successful
 */
export function isCheckoutSuccess(response: CreateCheckoutSessionResponse | undefined): response is Extract<CreateCheckoutSessionResponse, { success: true }> {
  return response !== undefined && response.success === true && 'data' in response;
}

/**
 * Get checkout URL from successful response
 */
export function getCheckoutUrl(response: CreateCheckoutSessionResponse | undefined): string | undefined {
  if (!isCheckoutSuccess(response)) {
    return undefined;
  }
  return response.data.url;
}

/**
 * Type guard to check if sync-after-checkout response is successful
 */
export function isSyncAfterCheckoutSuccess(response: SyncAfterCheckoutResponse | undefined): response is Extract<SyncAfterCheckoutResponse, { success: true }> {
  return response !== undefined && response.success === true && 'data' in response;
}

/**
 * Get tier change from sync response safely
 */
export function getSyncedTierChange(response: SyncAfterCheckoutResponse | undefined) {
  if (!isSyncAfterCheckoutSuccess(response)) {
    return undefined;
  }
  return response.data.tierChange;
}

/**
 * Get purchase type from sync response safely
 */
export function getSyncPurchaseType(response: SyncAfterCheckoutResponse | undefined) {
  if (!isSyncAfterCheckoutSuccess(response)) {
    return undefined;
  }
  return response.data.purchaseType;
}
