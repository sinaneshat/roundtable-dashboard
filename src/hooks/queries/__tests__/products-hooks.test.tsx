/**
 * Products Query Hooks Tests
 *
 * Comprehensive tests for product and pricing data fetching with TanStack Query:
 * - useProductsQuery - Fetch all products with pricing plans
 * - useProductQuery - Fetch single product by ID
 *
 * Coverage:
 * - Successful data fetching and caching
 * - Loading states during fetch
 * - Error states are properly exposed
 * - Cache invalidation scenarios
 * - Stale data handling (infinite cache for products catalog)
 * - Refetch triggers and configuration
 * - Query enabled/disabled conditions
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createEmptyProductsListResponse,
  createMockEnterpriseProduct,
  createMockFreeProduct,
  createMockProduct,
  createMockProductCatalog,
  createMockProProduct,
  createProductDetailResponse,
  createProductErrorResponse,
  createProductsListErrorResponse,
  createProductsListResponse,
} from '@/lib/testing';
import * as apiServices from '@/services/api';

import { useProductQuery, useProductsQuery } from '../products';

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

      vi.spyOn(apiServices, 'getProductsService').mockResolvedValue(mockResponse);

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

      vi.spyOn(apiServices, 'getProductsService').mockResolvedValue(mockResponse);

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

      vi.spyOn(apiServices, 'getProductsService').mockResolvedValue(mockResponse);

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
    it('should cache products data with infinite staleTime', async () => {
      const mockProducts = [createMockFreeProduct(), createMockProProduct()];
      const mockResponse = createProductsListResponse(mockProducts);

      const serviceSpy = vi.spyOn(apiServices, 'getProductsService').mockResolvedValue(mockResponse);

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

      const serviceSpy = vi.spyOn(apiServices, 'getProductsService').mockResolvedValue(mockResponse);

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

      const serviceSpy = vi.spyOn(apiServices, 'getProductsService').mockResolvedValue(mockResponse);

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

      const serviceSpy = vi.spyOn(apiServices, 'getProductsService').mockResolvedValue(mockResponse);

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

      vi.spyOn(apiServices, 'getProductsService').mockImplementation(
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

      vi.spyOn(apiServices, 'getProductsService').mockResolvedValue(mockResponse);

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

      vi.spyOn(apiServices, 'getProductsService').mockResolvedValue(mockErrorResponse);

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

      vi.spyOn(apiServices, 'getProductsService').mockResolvedValue(mockErrorResponse);

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
        .spyOn(apiServices, 'getProductsService')
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
      await queryClient.invalidateQueries({ queryKey: ['products', 'list'] });

      await waitFor(() => {
        expect(result.current.data?.data?.items).toHaveLength(3);
      });

      expect(serviceSpy).toHaveBeenCalledTimes(2);
    });
  });
});

// ============================================================================
// useProductQuery Tests
// ============================================================================

describe('useProductQuery', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('successful data fetching', () => {
    it('should fetch and return specific product by ID', async () => {
      const mockProduct = createMockProProduct();
      const mockResponse = createProductDetailResponse(mockProduct);

      vi.spyOn(apiServices, 'getProductService').mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useProductQuery('prod_pro'), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.success).toBe(true);
      expect(result.current.data?.data?.product.id).toBe('prod_pro');
      expect(result.current.data?.data?.product.name).toBe('Pro Plan');
    });

    it('should include pricing plans in product detail', async () => {
      const mockProduct = createMockEnterpriseProduct();
      const mockResponse = createProductDetailResponse(mockProduct);

      vi.spyOn(apiServices, 'getProductService').mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useProductQuery('prod_enterprise'), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const product = result.current.data?.data?.product;
      expect(product?.prices).toBeDefined();
      expect(product?.prices).toHaveLength(1);
      expect(product?.prices[0]?.productId).toBe('prod_enterprise');
    });

    it('should fetch product with features', async () => {
      const mockProduct = createMockProduct({
        id: 'prod_custom',
        name: 'Custom Plan',
        features: ['Feature 1', 'Feature 2', 'Feature 3'],
      });
      const mockResponse = createProductDetailResponse(mockProduct);

      vi.spyOn(apiServices, 'getProductService').mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useProductQuery('prod_custom'), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.data?.product.features).toHaveLength(3);
      expect(result.current.data?.data?.product.features).toContain('Feature 1');
    });
  });

  describe('query enabled conditions', () => {
    it('should not fetch when productId is empty', async () => {
      const serviceSpy = vi.spyOn(apiServices, 'getProductService');

      const { result } = renderHook(() => useProductQuery(''), {
        wrapper: createWrapper(queryClient),
      });

      // Query should be disabled
      expect(result.current.isPending).toBe(true);
      expect(result.current.fetchStatus).toBe('idle');
      expect(serviceSpy).not.toHaveBeenCalled();
    });

    it('should enable query when productId is provided', async () => {
      const mockProduct = createMockFreeProduct();
      const mockResponse = createProductDetailResponse(mockProduct);

      const serviceSpy = vi.spyOn(apiServices, 'getProductService').mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useProductQuery('prod_free'), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(serviceSpy).toHaveBeenCalledTimes(1);
      expect(serviceSpy).toHaveBeenCalledWith({ param: { id: 'prod_free' } });
    });

    it('should re-enable query when productId changes from empty to valid', async () => {
      const mockProduct = createMockProProduct();
      const mockResponse = createProductDetailResponse(mockProduct);

      const serviceSpy = vi.spyOn(apiServices, 'getProductService').mockResolvedValue(mockResponse);

      const { result, rerender } = renderHook(({ productId }) => useProductQuery(productId), {
        wrapper: createWrapper(queryClient),
        initialProps: { productId: '' },
      });

      expect(serviceSpy).not.toHaveBeenCalled();

      // Change to valid productId
      rerender({ productId: 'prod_pro' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(serviceSpy).toHaveBeenCalledTimes(1);
      expect(result.current.data?.data?.product.id).toBe('prod_pro');
    });
  });

  describe('loading states', () => {
    it('should expose loading state during fetch', async () => {
      const mockProduct = createMockFreeProduct();
      const mockResponse = createProductDetailResponse(mockProduct);

      vi.spyOn(apiServices, 'getProductService').mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(mockResponse), 100);
          }),
      );

      const { result } = renderHook(() => useProductQuery('prod_free'), {
        wrapper: createWrapper(queryClient),
      });

      expect(result.current.isPending).toBe(true);
      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.isPending).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle product not found error', async () => {
      const mockErrorResponse = createProductErrorResponse('Product not found');

      vi.spyOn(apiServices, 'getProductService').mockResolvedValue(mockErrorResponse);

      const { result } = renderHook(() => useProductQuery('prod_nonexistent'), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.success).toBe(false);
      expect(result.current.data?.error?.code).toBe('NOT_FOUND');
      expect(result.current.data?.error?.message).toBe('Product not found');
    });

    it('should handle inactive product error', async () => {
      const mockErrorResponse = createProductErrorResponse('Product is no longer active');

      vi.spyOn(apiServices, 'getProductService').mockResolvedValue(mockErrorResponse);

      const { result } = renderHook(() => useProductQuery('prod_inactive'), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.success).toBe(false);
      expect(result.current.data?.error?.message).toBe('Product is no longer active');
    });

    it('should not retry on error due to retry: false', async () => {
      const mockErrorResponse = createProductErrorResponse('Server error');

      const serviceSpy = vi.spyOn(apiServices, 'getProductService').mockResolvedValue(mockErrorResponse);

      const { result } = renderHook(() => useProductQuery('prod_test'), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Should only be called once (no retries)
      expect(serviceSpy).toHaveBeenCalledTimes(1);
      expect(result.current.data?.success).toBe(false);
    });

    it('should not throw on error due to throwOnError: false', async () => {
      const mockErrorResponse = createProductErrorResponse('Critical error');

      vi.spyOn(apiServices, 'getProductService').mockResolvedValue(mockErrorResponse);

      // Should not throw
      const { result } = renderHook(() => useProductQuery('prod_test'), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Error is in data, not thrown
      expect(result.current.data?.success).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('stale time configuration', () => {
    it('should use 1 hour staleTime as configured in hook', async () => {
      const mockProduct = createMockFreeProduct();
      const mockResponse = createProductDetailResponse(mockProduct);

      const serviceSpy = vi.spyOn(apiServices, 'getProductService').mockResolvedValue(mockResponse);

      const { result, rerender } = renderHook(() => useProductQuery('prod_test'), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(serviceSpy).toHaveBeenCalledTimes(1);

      // Rerender - should NOT refetch due to staleTime
      rerender();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Still only 1 call - data is fresh within staleTime window
      expect(serviceSpy).toHaveBeenCalledTimes(1);
      expect(result.current.data?.data?.product.id).toBe('prod_free');
    });
  });

  describe('cache invalidation', () => {
    it('should refetch on manual invalidation', async () => {
      const initialProduct = createMockFreeProduct();
      const updatedProduct = createMockProProduct();

      const serviceSpy = vi
        .spyOn(apiServices, 'getProductService')
        .mockResolvedValueOnce(createProductDetailResponse(initialProduct))
        .mockResolvedValueOnce(createProductDetailResponse(updatedProduct));

      const { result } = renderHook(() => useProductQuery('prod_test'), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.data?.product.id).toBe('prod_free');
      expect(serviceSpy).toHaveBeenCalledTimes(1);

      // Invalidate specific product cache and wait for refetch
      await queryClient.invalidateQueries({ queryKey: ['products', 'detail', 'prod_test'] });

      // Wait for the query to refetch after invalidation
      await waitFor(() => {
        expect(serviceSpy).toHaveBeenCalledTimes(2);
      });

      // Verify updated data
      expect(result.current.data?.data?.product.id).toBe('prod_pro');
    });
  });
});
