/**
 * Products Service - Stripe Products API
 *
 * 100% type-safe RPC service for Stripe product operations
 * All types automatically inferred from backend Hono routes
 *
 * NOTE: All product/pricing endpoints are PUBLIC - no auth required.
 * Uses createPublicApiClient() to avoid cookie access for SSG/ISR compatibility.
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/api/client';
import { createPublicApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

export type GetProductsRequest = InferRequestType<
  ApiClientType['billing']['products']['$get']
>;

export type GetProductsResponse = InferResponseType<
  ApiClientType['billing']['products']['$get']
>;

export type GetProductRequest = InferRequestType<
  ApiClientType['billing']['products'][':id']['$get']
>;

export type GetProductResponse = InferResponseType<
  ApiClientType['billing']['products'][':id']['$get']
>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Get all active products with pricing plans
 * Public endpoint - no authentication required
 *
 * Uses createPublicApiClient() for SSG/ISR compatibility (no cookie access).
 */
export async function getProductsService(args?: GetProductsRequest) {
  const client = createPublicApiClient();
  return parseResponse(client.billing.products.$get(args ?? {}));
}

/**
 * Get a specific product by ID with all pricing plans
 * Public endpoint - no authentication required
 *
 * Uses createPublicApiClient() for SSG/ISR compatibility (no cookie access).
 */
export async function getProductService(data: GetProductRequest) {
  const client = createPublicApiClient();
  const params: GetProductRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.billing.products[':id'].$get(params));
}
