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

type ListProductsEndpoint = ApiClientType['billing']['billing']['products']['$get'];
export type ListProductsResponse = InferResponseType<ListProductsEndpoint, 200>;

type GetProductEndpoint = ApiClientType['billing']['billing']['products'][':id']['$get'];
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
  const res = await client.billing.billing.products.$get();
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
  const res = await client.billing.billing.products[':id'].$get(data);
  if (!res.ok) {
    throw new ServiceFetchError(`Failed to fetch product: ${res.statusText}`, res.status, res.statusText);
  }
  return res.json();
}

// ============================================================================
// Derived Types
// ============================================================================

type ProductsSuccessData = Extract<ListProductsResponse, { success: true }> extends { data: infer D } ? D : never;
type ProductItem = ProductsSuccessData extends { items: (infer P)[] } ? P : never;
type PriceItem = NonNullable<ProductItem> extends { prices?: (infer Pr)[] } ? Pr : never;

/**
 * Product - Product item derived from API response
 */
export type Product = ProductItem;

/**
 * Price - Price item derived from product prices
 */
export type Price = PriceItem;

// ============================================================================
// Type Guards - Accept both service response and server function result types
// ============================================================================

type SuccessResponse = Extract<ListProductsResponse, { success: true }>;

/**
 * Type guard to check if products response is successful
 * Accepts ListProductsResponse | ServerFnErrorResponse | undefined to handle both
 * direct service calls and TanStack Query results
 */
export function isProductsSuccess(response: { success: boolean; data?: unknown } | null | undefined): response is SuccessResponse {
  return response !== undefined && response !== null && response.success === true && 'data' in response;
}

/**
 * Extract products array from response safely
 * Accepts ListProductsResponse | ServerFnErrorResponse | undefined to handle both
 * direct service calls and TanStack Query results
 */
export function getProductsFromResponse(response: { success: boolean; data?: unknown } | null | undefined): Product[] {
  if (!isProductsSuccess(response)) {
    return [];
  }
  return response.data.items;
}
