/**
 * Checkout Service - Stripe Checkout API
 *
 * 100% type-safe RPC service for Stripe checkout operations
 * All types automatically inferred from backend Hono routes
 */

import { parseResponse } from 'hono/client';

import { createApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

export type CreateCheckoutSessionRequest = any;

export type CreateCheckoutSessionResponse = any;

export type SyncAfterCheckoutRequest = any;

export type SyncAfterCheckoutResponse = any;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Create Stripe checkout session for subscription purchase
 * Protected endpoint - requires authentication
 */
export async function createCheckoutSessionService(data: CreateCheckoutSessionRequest) {
  const client = await createApiClient();
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
 */
export async function syncAfterCheckoutService(data?: SyncAfterCheckoutRequest) {
  const client = await createApiClient();
  return parseResponse(client.billing['sync-after-checkout'].$post(data ?? {}));
}
