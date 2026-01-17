/**
 * Products Service - Stripe Products API
 *
 * 100% type-safe RPC service for Stripe product operations
 * All types automatically inferred from backend Hono routes
 *
 * NOTE: All product/pricing endpoints are PUBLIC - no auth required.
 * Uses createPublicApiClient() to avoid cookie access for SSG/ISR compatibility.
 */

import { parseResponse } from 'hono/client';

import { createPublicApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

export type GetProductsRequest = any;

export type GetProductsResponse = any;

export type GetProductRequest = any;

export type GetProductResponse = any;

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
  const client = await createPublicApiClient();
  const response = await client.billing.products.$get(args ?? {});
  return parseResponse(response);
}

/**
 * Get a specific product by ID with all pricing plans
 * Public endpoint - no authentication required
 *
 * Uses createPublicApiClient() for SSG/ISR compatibility (no cookie access).
 */
export async function getProductService(data: GetProductRequest) {
  const client = await createPublicApiClient();
  const params: GetProductRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.billing.products[':id'].$get(params));
}
