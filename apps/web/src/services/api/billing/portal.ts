/**
 * Customer Portal Service - Stripe Customer Portal API
 *
 * 100% type-safe RPC service for Stripe customer portal operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';

import type { ApiClientType } from '@/lib/api/client';
import { createApiClient, ServiceFetchError } from '@/lib/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

type CreatePortalEndpoint = ApiClientType['billing']['billing']['portal']['$post'];
export type CreateCustomerPortalSessionRequest = InferRequestType<CreatePortalEndpoint>;
export type CreateCustomerPortalSessionResponse = InferResponseType<CreatePortalEndpoint, 200>;

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
export async function createCustomerPortalSessionService(data: CreateCustomerPortalSessionRequest): Promise<CreateCustomerPortalSessionResponse> {
  const client = createApiClient();
  const res = await client.billing.billing.portal.$post(data);
  if (!res.ok) {
    throw new ServiceFetchError(`Failed to create portal session: ${res.statusText}`, res.status, res.statusText);
  }
  return res.json();
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if portal response is successful
 */
export function isPortalSuccess(response: CreateCustomerPortalSessionResponse | undefined): response is Extract<CreateCustomerPortalSessionResponse, { success: true }> {
  return response !== undefined && response.success === true && 'data' in response;
}

/**
 * Get portal URL from successful response
 */
export function getPortalUrl(response: CreateCustomerPortalSessionResponse | undefined): string | undefined {
  if (!isPortalSuccess(response)) {
    return undefined;
  }
  return response.data.url;
}
