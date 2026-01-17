/**
 * Customer Portal Service - Stripe Customer Portal API
 *
 * 100% type-safe RPC service for Stripe customer portal operations
 * All types automatically inferred from backend Hono routes
 */

import { parseResponse } from 'hono/client';

import { createApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

export type CreateCustomerPortalSessionRequest = any;

export type CreateCustomerPortalSessionResponse = any;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Create Stripe customer portal session
 * Protected endpoint - requires authentication
 *
 * Returns a URL to redirect the user to Stripe's customer portal
 * where they can manage payment methods and download invoices
 */
export async function createCustomerPortalSessionService(data: CreateCustomerPortalSessionRequest) {
  const client = await createApiClient();
  const params: CreateCustomerPortalSessionRequest = {
    json: data.json ?? {},
  };
  return parseResponse(client.billing.portal.$post(params));
}
