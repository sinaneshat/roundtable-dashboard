/**
 * Product Query Hooks
 *
 * TanStack Query hooks for Stripe products
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/data/query-keys';
import {
  getProductService,
  getProductsService,
} from '@/services/api';

/**
 * Hook to fetch all products with pricing plans
 * Protected route - requires authentication
 * Products are static catalog data, cached infinitely
 */
export function useProductsQuery() {
  return useQuery({
    queryKey: queryKeys.products.list(),
    queryFn: async () => {
      const response = await getProductsService();

      if (response.success && response.data) {
        return {
          ...response,
          data: {
            products: response.data.items,
            count: response.data.count,
          },
        };
      }

      return response;
    },
    staleTime: Infinity, // Static catalog - never stale, matches server prefetch
    gcTime: Infinity,
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
    queryFn: async () => getProductService({ param: { id: productId } }),
    staleTime: 3600 * 1000, // 1 hour
    enabled: !!productId, // Only fetch when productId is available
    retry: false,
    throwOnError: false,
  });
}
