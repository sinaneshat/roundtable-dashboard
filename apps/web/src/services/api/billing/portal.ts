/**
 * Customer Portal Service - Stripe Customer Portal API
 *
 * 100% type-safe RPC service for Stripe customer portal operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/lib/api/client';
import { createApiClient } from '@/lib/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

type CreatePortalEndpoint = ApiClientType['billing']['portal']['$post'];
export type CreateCustomerPortalSessionRequest = InferRequestType<CreatePortalEndpoint>;
export type CreateCustomerPortalSessionResponse = InferResponseType<CreatePortalEndpoint>;

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
  const client = createApiClient();
  return parseResponse(client.billing.portal.$post(data));
}
