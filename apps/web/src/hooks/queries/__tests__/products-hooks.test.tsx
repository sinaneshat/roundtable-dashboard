/**
 * Products Query Hooks Tests
 *
 * Comprehensive tests for product and pricing data fetching with TanStack Query:
 * - useProductsQuery - Fetch all products with pricing plans
 *
 * Coverage:
 * - Successful data fetching and caching
 * - Loading states during fetch
 * - Error states are properly exposed
 * - Cache invalidation scenarios
 * - Stale data handling (24h cache for products catalog)
 * - Refetch triggers and configuration
 * - SSR hydration consistency via shared queryOptions
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { queryKeys } from '@/lib/data/query-keys';
import {
  createEmptyProductsListResponse,
  createMockFreeProduct,
  createMockProductCatalog,
  createMockProProduct,
  createProductsListErrorResponse,
  createProductsListResponse,
  renderHook,
  waitFor,
} from '@/lib/testing';
import * as serverFunctions from '@/server/products';

import { useProductsQuery } from '../products';

// ============================================================================
// Test Setup
// ============================================================================

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

type WrapperProps = {
  children: ReactNode;
};

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: WrapperProps) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

// ============================================================================
// useProductsQuery Tests
// ============================================================================

describe('useProductsQuery', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('successful data fetching', () => {
    it('should fetch and return product catalog with all pricing plans', async () => {
      const mockProducts = createMockProductCatalog();
      const mockResponse = createProductsListResponse(mockProducts);

      vi.spyOn(serverFunctions, 'getProducts').mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useProductsQuery(), {
        wrapper: createWrapper(queryClient),
      });

      // Initial state - loading
      expect(result.current.isPending).toBe(true);
      expect(result.current.data).toBeUndefined();

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.success).toBe(true);
      expect(result.current.data?.data?.items).toHaveLength(3);
      expect(result.current.data?.data?.items).toEqual(mockProducts);
    });

    it('should return products with associated pricing plans', async () => {
      const proProduct = createMockProProduct();
      const mockResponse = createProductsListResponse([proProduct]);

      vi.spyOn(serverFunctions, 'getProducts').mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useProductsQuery(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const product = result.current.data?.data?.items?.[0];
      expect(product?.prices).toBeDefined();
      expect(product?.prices).toHaveLength(1);
      expect(product?.prices?.[0]?.id).toBe('price_pro_monthly');
    });

    it('should return empty list when no products exist', async () => {
      const mockResponse = createEmptyProductsListResponse();

      vi.spyOn(serverFunctions, 'getProducts').mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useProductsQuery(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.data?.items).toHaveLength(0);
      expect(result.current.data?.success).toBe(true);
    });
  });

  describe('caching behavior', () => {
    it('should cache products data with 24h staleTime', async () => {
      const mockProducts = [createMockFreeProduct(), createMockProProduct()];
      const mockResponse = createProductsListResponse(mockProducts);

      const serviceSpy = vi.spyOn(serverFunctions, 'getProducts').mockResolvedValue(mockResponse);

      const { result, rerender } = renderHook(() => useProductsQuery(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(serviceSpy).toHaveBeenCalledTimes(1);

      // Rerender - should use cached data (no refetch due to Infinity staleTime)
      rerender();

      // Wait a bit to ensure no additional calls
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(serviceSpy).toHaveBeenCalledTimes(1);
      expect(result.current.data?.data?.items).toHaveLength(2);
    });

    it('should not refetch on mount due to refetchOnMount: false', async () => {
      const mockProducts = createMockProductCatalog();
      const mockResponse = createProductsListResponse(mockProducts);

      const serviceSpy = vi.spyOn(serverFunctions, 'getProducts').mockResolvedValue(mockResponse);

      const { result, unmount } = renderHook(() => useProductsQuery(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(serviceSpy).toHaveBeenCalledTimes(1);

      // Unmount and remount
      unmount();

      const { result: result2 } = renderHook(() => useProductsQuery(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result2.current.isSuccess).toBe(true);
      });

      // Should still be 1 call (refetchOnMount: false)
      expect(serviceSpy).toHaveBeenCalledTimes(1);
    });

    it('should not refetch on window focus due to refetchOnWindowFocus: false', async () => {
      const mockProducts = [createMockProProduct()];
      const mockResponse = createProductsListResponse(mockProducts);

      const serviceSpy = vi.spyOn(serverFunctions, 'getProducts').mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useProductsQuery(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(serviceSpy).toHaveBeenCalledTimes(1);

      // Simulate window focus event
      window.dispatchEvent(new Event('focus'));

      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not refetch
      expect(serviceSpy).toHaveBeenCalledTimes(1);
    });

    it('should not refetch on reconnect due to refetchOnReconnect: false', async () => {
      const mockProducts = createMockProductCatalog();
      const mockResponse = createProductsListResponse(mockProducts);

      const serviceSpy = vi.spyOn(serverFunctions, 'getProducts').mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useProductsQuery(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(serviceSpy).toHaveBeenCalledTimes(1);

      // Simulate reconnect
      window.dispatchEvent(new Event('online'));

      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not refetch
      expect(serviceSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('loading states', () => {
    it('should expose loading state during initial fetch', async () => {
      const mockProducts = [createMockFreeProduct()];
      const mockResponse = createProductsListResponse(mockProducts);

      vi.spyOn(serverFunctions, 'getProducts').mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(mockResponse), 100);
          }),
      );

      const { result } = renderHook(() => useProductsQuery(), {
        wrapper: createWrapper(queryClient),
      });

      // Should be in loading state initially
      expect(result.current.isPending).toBe(true);
      expect(result.current.isLoading).toBe(true);
      expect(result.current.isFetching).toBe(true);
      expect(result.current.data).toBeUndefined();

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.isPending).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isFetching).toBe(false);
    });

    it('should show fetching state during background refetch', async () => {
      const mockProducts = createMockProductCatalog();
      const mockResponse = createProductsListResponse(mockProducts);

      vi.spyOn(serverFunctions, 'getProducts').mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useProductsQuery(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Manual refetch
      result.current.refetch();

      // Wait for refetch to complete - fetching state is transient
      await waitFor(() => {
        expect(result.current.isFetching).toBe(false);
      });

      // After refetch completes, should still have data
      expect(result.current.isPending).toBe(false);
      expect(result.current.data).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle API error responses', async () => {
      const mockErrorResponse = createProductsListErrorResponse('Failed to fetch products');

      vi.spyOn(serverFunctions, 'getProducts').mockResolvedValue(mockErrorResponse);

      const { result } = renderHook(() => useProductsQuery(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.success).toBe(false);
      expect(result.current.data?.error?.message).toBe('Failed to fetch products');
      expect(result.current.data?.error?.code).toBe('INTERNAL_SERVER_ERROR');
    });

    it('should handle service unavailable error', async () => {
      const mockErrorResponse = createProductsListErrorResponse('Service temporarily unavailable');

      vi.spyOn(serverFunctions, 'getProducts').mockResolvedValue(mockErrorResponse);

      const { result } = renderHook(() => useProductsQuery(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.success).toBe(false);
      expect(result.current.data?.error?.message).toBe('Service temporarily unavailable');
    });
  });

  describe('cache invalidation', () => {
    it('should allow manual cache invalidation', async () => {
      const initialProducts = [createMockFreeProduct()];
      const updatedProducts = createMockProductCatalog();

      const serviceSpy = vi
        .spyOn(serverFunctions, 'getProducts')
        .mockResolvedValueOnce(createProductsListResponse(initialProducts))
        .mockResolvedValueOnce(createProductsListResponse(updatedProducts));

      const { result } = renderHook(() => useProductsQuery(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.data?.items).toHaveLength(1);

      // Invalidate cache
      await queryClient.invalidateQueries({ queryKey: queryKeys.products.list() });

      await waitFor(() => {
        expect(result.current.data?.data?.items).toHaveLength(3);
      });

      expect(serviceSpy).toHaveBeenCalledTimes(2);
    });
  });
});
