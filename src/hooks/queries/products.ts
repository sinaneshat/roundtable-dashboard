/**
 * Product Query Hooks
 *
 * TanStack Query hooks for Stripe products
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
 *
 * SSG: Data is baked at build time, never refetch on client
 */
export function useProductsQuery() {
  return useQuery({
    queryKey: queryKeys.products.list(),
    queryFn: () => getProductsService(),
    staleTime: Infinity, // SSG: data baked at build time
    gcTime: Infinity, // Keep in cache forever
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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
    queryFn: () => getProductService({ param: { id: productId } }),
    staleTime: STALE_TIMES.products, // 1 hour
    enabled: !!productId, // Only fetch when productId is available
    retry: false,
    throwOnError: false,
  });
}
