/**
 * Products Service - Stripe Products API
 *
 * 100% type-safe RPC service for Stripe product operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/api/client';
import { createApiClient } from '@/api/client';

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
 * Following Hono RPC best practices: Always provide an object to $get()
 * even when all query parameters are optional. Use nullish coalescing
 * to ensure type safety.
 */
export async function getProductsService(args?: GetProductsRequest) {
  const client = await createApiClient();
  return parseResponse(client.billing.products.$get(args ?? {}));
}

/**
 * Get a specific product by ID with all pricing plans
 * Public endpoint - no authentication required
 *
 * @param data - Request with param.id for product ID
 */
export async function getProductService(data: GetProductRequest) {
  const client = await createApiClient();
  // Internal fallback: ensure param exists
  const params: GetProductRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.billing.products[':id'].$get(params));
}
