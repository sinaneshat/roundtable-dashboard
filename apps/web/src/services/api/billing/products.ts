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

import type { ApiClientType } from '@/lib/api/client';
import { createPublicApiClient } from '@/lib/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

type ListProductsEndpoint = ApiClientType['billing']['products']['$get'];
export type ListProductsResponse = InferResponseType<ListProductsEndpoint>;

type GetProductEndpoint = ApiClientType['billing']['products'][':id']['$get'];
export type GetProductRequest = InferRequestType<GetProductEndpoint>;
export type GetProductResponse = InferResponseType<GetProductEndpoint>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Get all active products with pricing plans
 * Public endpoint - no authentication required
 *
 * Uses createPublicApiClient() for SSG/ISR compatibility (no cookie access).
 */
export async function getProductsService() {
  const client = createPublicApiClient();
  return parseResponse(client.billing.products.$get());
}

/**
 * Get a specific product by ID with all pricing plans
 * Public endpoint - no authentication required
 *
 * Uses createPublicApiClient() for SSG/ISR compatibility (no cookie access).
 */
export async function getProductService(data: GetProductRequest) {
  const client = createPublicApiClient();
  return parseResponse(client.billing.products[':id'].$get(data));
}
