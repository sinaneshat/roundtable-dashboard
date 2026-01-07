/**
 * Product Query Hooks
 *
 * TanStack Query hooks for Stripe products
 *
 * IMPORTANT: staleTime must match server prefetch (STALE_TIMES.products)
 * for proper SSR hydration. Mismatched staleTime causes client refetch.
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import {
  getProductService,
  getProductsService,
} from '@/services/api';

/**
 * Hook to fetch all products with pricing plans
 * Public endpoint - no authentication required
 * Products are static catalog data with ISR (24h revalidation)
 */
export function useProductsQuery() {
  return useQuery({
    queryKey: queryKeys.products.list(),
    queryFn: getProductsService,
    staleTime: STALE_TIMES.products, // Must match server prefetch for hydration
    gcTime: Infinity,
    retry: false,
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
    staleTime: 3600 * 1000, // 1 hour
    enabled: !!productId, // Only fetch when productId is available
    retry: false,
    throwOnError: false,
  });
}
