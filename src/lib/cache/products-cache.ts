/**
 * Products Cache - Server-side caching for product data
 *
 * NOTE: 'use cache' directive is disabled due to cacheComponents incompatibility
 * with opennextjs-cloudflare. Using direct service calls with ISR instead.
 *
 * Cache Strategy:
 * - ISR via `export const revalidate` in pages (24h for products)
 * - TanStack Query prefetch for hydration
 * - On-demand revalidation via revalidateTag('products')
 */

import type { GetProductsResponse } from '@/services/api';
import { getProductService, getProductsService } from '@/services/api';

// ============================================================================
// Cache Tag Constants
// ============================================================================

export const PRODUCT_CACHE_TAGS = {
  /** All products list */
  all: 'products',
  /** Single product by ID */
  product: (id: string) => `product:${id}`,
} as const;

// ============================================================================
// Product Data Functions (no 'use cache' - cacheComponents disabled)
// ============================================================================

/**
 * Get all products
 * Direct service call - caching handled by ISR at page level
 *
 * @returns Products response
 */
export async function getCachedProducts(): Promise<GetProductsResponse> {
  return getProductsService();
}

/**
 * Get a single product by ID
 *
 * @param id - Product ID
 * @returns Product response
 */
export async function getCachedProduct(id: string) {
  return getProductService({ param: { id } });
}
