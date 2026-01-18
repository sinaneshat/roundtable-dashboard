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

import type { ApiClientType } from '@/lib/api/client';
import { createPublicApiClient, ServiceFetchError } from '@/lib/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

type ListProductsEndpoint = ApiClientType['billing']['products']['$get'];
export type ListProductsResponse = InferResponseType<ListProductsEndpoint, 200>;

type GetProductEndpoint = ApiClientType['billing']['products'][':id']['$get'];
export type GetProductRequest = InferRequestType<GetProductEndpoint>;
export type GetProductResponse = InferResponseType<GetProductEndpoint, 200>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Get all active products with pricing plans
 * Public endpoint - no authentication required
 *
 * Uses createPublicApiClient() for SSG/ISR compatibility (no cookie access).
 */
export async function getProductsService(): Promise<ListProductsResponse> {
  const client = createPublicApiClient();
  const res = await client.billing.products.$get();
  if (!res.ok) {
    throw new ServiceFetchError(`Failed to fetch products: ${res.statusText}`, res.status, res.statusText);
  }
  return res.json();
}

/**
 * Get a specific product by ID with all pricing plans
 * Public endpoint - no authentication required
 *
 * Uses createPublicApiClient() for SSG/ISR compatibility (no cookie access).
 */
export async function getProductService(data: GetProductRequest): Promise<GetProductResponse> {
  const client = createPublicApiClient();
  const res = await client.billing.products[':id'].$get(data);
  if (!res.ok) {
    throw new ServiceFetchError(`Failed to fetch product: ${res.statusText}`, res.status, res.statusText);
  }
  return res.json();
}

// ============================================================================
// Derived Types
// ============================================================================

type ProductsSuccessData = Extract<ListProductsResponse, { success: true }> extends { data: infer D } ? D : never;
type ProductItem = ProductsSuccessData extends { items: Array<infer P> } ? P : never;
type PriceItem = NonNullable<ProductItem> extends { prices?: Array<infer Pr> } ? Pr : never;

/**
 * Product - Product item derived from API response
 */
export type Product = ProductItem;

/**
 * Price - Price item derived from product prices
 */
export type Price = PriceItem;
