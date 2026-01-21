/**
 * Product Query Hooks
 *
 * TanStack Query hooks for Stripe products
 *
 * CRITICAL: Uses shared queryOptions from query-options.ts for useProductsQuery
 * This ensures SSR hydration works correctly - same config in loader and hook
 */

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/data/query-keys';
import { productsQueryOptions } from '@/lib/data/query-options';
import { GC_TIMES, STALE_TIMES } from '@/lib/data/stale-times';
import { getProductService } from '@/services/api';

/**
 * Hook to fetch all products with pricing plans
 * Public endpoint - no authentication required
 * Products are static catalog data with ISR (24h revalidation)
 *
 * ✅ SSR HYDRATION: Uses shared queryOptions for seamless server-client data transfer
 */
export function useProductsQuery() {
  return useQuery({
    ...productsQueryOptions,
    throwOnError: false,
  });
}

/**
 * Hook to fetch a specific product by ID
 * Public endpoint - no authentication required
 *
 * @param productId - Product ID
 */
export function useProductQuery(productId: string) {
  return useQuery({
    queryKey: queryKeys.products.detail(productId),
    queryFn: async () => getProductService({ param: { id: productId } }),
    staleTime: STALE_TIMES.products,
    gcTime: GC_TIMES.INFINITE,
    enabled: !!productId,
    retry: false,
    throwOnError: false,
  });
}
