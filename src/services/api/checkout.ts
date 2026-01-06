/**
 * Checkout Service - Stripe Checkout API
 *
 * 100% type-safe RPC service for Stripe checkout operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/api/client';
import { createApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

export type CreateCheckoutSessionRequest = InferRequestType<
  ApiClientType['billing']['checkout']['$post']
>;

export type CreateCheckoutSessionResponse = InferResponseType<
  ApiClientType['billing']['checkout']['$post']
>;

export type SyncAfterCheckoutRequest = InferRequestType<
  ApiClientType['billing']['sync-after-checkout']['$post']
>;

export type SyncAfterCheckoutResponse = InferResponseType<
  ApiClientType['billing']['sync-after-checkout']['$post']
>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Create Stripe checkout session for subscription purchase
 * Protected endpoint - requires authentication
 *
 * @param data - Checkout session configuration (priceId, successUrl, cancelUrl)
 */
export async function createCheckoutSessionService(data: CreateCheckoutSessionRequest) {
  const client = await createApiClient();
  // Internal fallback: ensure json property exists
  const params: CreateCheckoutSessionRequest = {
    json: data.json ?? {},
  };
  return parseResponse(client.billing.checkout.$post(params));
}

/**
 * Sync Stripe data after successful checkout
 * Protected endpoint - requires authentication
 *
 * Theo's "Stay Sane with Stripe" pattern:
 * Eagerly fetches fresh subscription data from Stripe API immediately after checkout
 * to prevent race conditions with webhooks
 *
 * Following Hono RPC best practices: Always provide an object to $post()
 */
export async function syncAfterCheckoutService(data?: SyncAfterCheckoutRequest) {
  const client = await createApiClient();
  return parseResponse(client.billing['sync-after-checkout'].$post(data ?? {}));
}
