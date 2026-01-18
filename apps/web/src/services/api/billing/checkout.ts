/**
 * Checkout Service - Stripe Checkout API
 *
 * 100% type-safe RPC service for Stripe checkout operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/lib/api/client';
import { createApiClient } from '@/lib/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

type CreateCheckoutEndpoint = ApiClientType['billing']['checkout']['$post'];
export type CreateCheckoutSessionRequest = InferRequestType<CreateCheckoutEndpoint>;
export type CreateCheckoutSessionResponse = InferResponseType<CreateCheckoutEndpoint>;

type SyncAfterCheckoutEndpoint = ApiClientType['billing']['sync-after-checkout']['$post'];
export type SyncAfterCheckoutRequest = InferRequestType<SyncAfterCheckoutEndpoint>;
export type SyncAfterCheckoutResponse = InferResponseType<SyncAfterCheckoutEndpoint>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Create Stripe checkout session for subscription purchase
 * Protected endpoint - requires authentication
 */
export async function createCheckoutSessionService(data: CreateCheckoutSessionRequest) {
  const client = createApiClient();
  return parseResponse(client.billing.checkout.$post(data));
}

/**
 * Sync Stripe data after successful checkout
 * Protected endpoint - requires authentication
 *
 * Theo's "Stay Sane with Stripe" pattern:
 * Eagerly fetches fresh subscription data from Stripe API immediately after checkout
 * to prevent race conditions with webhooks
 */
export async function syncAfterCheckoutService(data?: SyncAfterCheckoutRequest) {
  const client = createApiClient();
  return parseResponse(client.billing['sync-after-checkout'].$post(data ?? {}));
}
