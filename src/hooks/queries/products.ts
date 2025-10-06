/**
 * Product Query Hooks
 *
 * TanStack Query hooks for Stripe products
 * Following patterns from commit a24d1f67d90381a2e181818f93b6a7ad63c062cc
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/data/query-keys';
import { getProductService, getProductsService } from '@/services/api';

/**
 * Hook to fetch all products with pricing plans
 * Public endpoint - no authentication required
 *
 * Stale time: 2 hours (products change infrequently)
 */
export function useProductsQuery() {
  return useQuery({
    queryKey: queryKeys.products.list(),
    queryFn: getProductsService,
    staleTime: 2 * 60 * 60 * 1000, // 2 hours
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to fetch a specific product by ID
 * Public endpoint - no authentication required
 *
 * @param productId - Stripe product ID
 */
export function useProductQuery(productId: string) {
  return useQuery({
    queryKey: queryKeys.products.detail(productId),
    queryFn: () => getProductService(productId),
    staleTime: 2 * 60 * 60 * 1000, // 2 hours
    enabled: !!productId, // Only fetch when productId is available
    retry: false,
    throwOnError: false,
  });
}
