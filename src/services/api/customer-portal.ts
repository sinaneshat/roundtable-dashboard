/**
 * Customer Portal Service - Stripe Customer Portal API
 *
 * 100% type-safe RPC service for Stripe customer portal operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/api/client';
import { createApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

export type CreateCustomerPortalSessionRequest = InferRequestType<
  ApiClientType['billing']['portal']['$post']
>;

export type CreateCustomerPortalSessionResponse = InferResponseType<
  ApiClientType['billing']['portal']['$post']
>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Create Stripe customer portal session
 * Protected endpoint - requires authentication
 *
 * Returns a URL to redirect the user to Stripe's customer portal
 * where they can manage payment methods and download invoices
 *
 * @param data - Customer portal configuration (returnUrl)
 */
export async function createCustomerPortalSessionService(data: CreateCustomerPortalSessionRequest) {
  const client = await createApiClient();
  // Internal fallback: ensure json property exists
  const params: CreateCustomerPortalSessionRequest = {
    json: data.json ?? {},
  };
  return parseResponse(client.billing.portal.$post(params));
}
