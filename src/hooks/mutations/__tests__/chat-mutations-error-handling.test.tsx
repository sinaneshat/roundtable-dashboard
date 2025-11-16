/**
 * Chat Mutations - Error Handling Tests
 *
 * Tests defensive error handling for invalid/undefined query cache data
 * Ensures parsing functions handle edge cases gracefully without console pollution
 *
 * Location: /src/hooks/mutations/__tests__/chat-mutations-error-handling.test.ts
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { queryKeys } from '@/lib/data/query-keys';

import {
  useCreateThreadMutation,
  useDeleteThreadMutation,
  useToggleFavoriteMutation,
  useTogglePublicMutation,
  useUpdateThreadMutation,
} from '../chat-mutations';

describe('chat Mutations - Error Handling', () => {
  let queryClient: QueryClient;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    queryClient.clear();
    consoleSpy.mockRestore();
  });

  // Helper to create wrapper with QueryClient
  const createWrapper = (client: QueryClient) => {
    return function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={client}>
          {children}
        </QueryClientProvider>
      );
    };
  };

  describe('parseInfiniteQueryData - Undefined Query Handling', () => {
    it('should silently handle undefined query data without logging errors', async () => {
      const { result } = renderHook(() => useUpdateThreadMutation(), {
        wrapper: createWrapper(queryClient),
      });

      // Simulate undefined query cache (uninitialized query)
      queryClient.setQueryData(queryKeys.threads.all, undefined);

      // Trigger mutation that calls setQueriesData with undefined data
      result.current.mutate({
        param: { id: 'thread-123' },
        json: { title: 'Updated Title' },
      });

      await waitFor(() => {
        // ✅ Should NOT log errors for undefined data
        expect(consoleSpy).not.toHaveBeenCalled();
      });
    });

    it('should silently handle null query data without logging errors', async () => {
      const { result } = renderHook(() => useUpdateThreadMutation(), {
        wrapper: createWrapper(queryClient),
      });

      // Simulate null query cache
      queryClient.setQueryData(queryKeys.threads.all, null);

      result.current.mutate({
        param: { id: 'thread-123' },
        json: { title: 'Updated Title' },
      });

      await waitFor(() => {
        // ✅ Should NOT log errors for null data
        expect(consoleSpy).not.toHaveBeenCalled();
      });
    });

    it('should handle malformed query data without crashing', async () => {
      const { result } = renderHook(() => useUpdateThreadMutation(), {
        wrapper: createWrapper(queryClient),
      });

      // Simulate malformed query cache (has data but wrong structure)
      const malformedData = {
        pages: 'invalid', // Should be array
      };
      queryClient.setQueryData(queryKeys.threads.all, malformedData);

      // Should not throw error
      expect(() => {
        result.current.mutate({
          param: { id: 'thread-123' },
          json: { title: 'Updated Title' },
        });
      }).not.toThrow();

      await waitFor(() => {
        // Should preserve malformed data (not crash, not overwrite with undefined)
        const cachedData = queryClient.getQueryData(queryKeys.threads.all);
        expect(cachedData).toEqual(malformedData);
      });
    });

    it('should gracefully return old data when parsing fails', async () => {
      const { result } = renderHook(() => useUpdateThreadMutation(), {
        wrapper: createWrapper(queryClient),
      });

      const malformedData = { pages: 'invalid' };
      queryClient.setQueryData(queryKeys.threads.all, malformedData);

      result.current.mutate({
        param: { id: 'thread-123' },
        json: { title: 'Updated Title' },
      });

      await waitFor(() => {
        // Should preserve malformed data (not crash, not overwrite)
        const cachedData = queryClient.getQueryData(queryKeys.threads.all);
        expect(cachedData).toEqual(malformedData);
      });
    });
  });

  describe('multiple Queries with setQueriesData', () => {
    it('should handle mix of undefined and defined queries without errors', async () => {
      const { result } = renderHook(() => useUpdateThreadMutation(), {
        wrapper: createWrapper(queryClient),
      });

      // Set up multiple queries with different states
      queryClient.setQueryData(queryKeys.threads.list({ tab: 'all' }), undefined); // Uninitialized
      queryClient.setQueryData(queryKeys.threads.list({ tab: 'favorites' }), {
        pages: [
          {
            success: true,
            data: {
              items: [
                { id: 'thread-123', title: 'Original Title', isFavorite: false },
              ],
            },
          },
        ],
        pageParams: [undefined],
      }); // Valid data

      result.current.mutate({
        param: { id: 'thread-123' },
        json: { title: 'Updated Title' },
      });

      await waitFor(() => {
        // ✅ Should NOT log errors for undefined query
        const errorCalls = consoleSpy.mock.calls.filter(call =>
          call[0].includes('Invalid infinite query data structure'),
        );
        expect(errorCalls).toHaveLength(0);

        // Should update the valid query
        const favoritesData = queryClient.getQueryData(
          queryKeys.threads.list({ tab: 'favorites' }),
        ) as { pages: Array<{ data: { items: Array<{ title: string }> } }> };
        expect(favoritesData.pages[0].data.items[0].title).toBe('Updated Title');
      });
    });
  });

  describe('useDeleteThreadMutation - Undefined Query Handling', () => {
    it('should handle undefined thread list without logging errors', async () => {
      const { result } = renderHook(() => useDeleteThreadMutation(), {
        wrapper: createWrapper(queryClient),
      });

      queryClient.setQueryData(queryKeys.threads.all, undefined);

      result.current.mutate({ param: { id: 'thread-123' } });

      await waitFor(() => {
        expect(consoleSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('useToggleFavoriteMutation - Undefined Query Handling', () => {
    it('should handle undefined thread list without logging errors', async () => {
      const { result } = renderHook(() => useToggleFavoriteMutation(), {
        wrapper: createWrapper(queryClient),
      });

      queryClient.setQueryData(queryKeys.threads.all, undefined);

      result.current.mutate({
        threadId: 'thread-123',
        isFavorite: true,
      });

      await waitFor(() => {
        expect(consoleSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('useTogglePublicMutation - Undefined Query Handling', () => {
    it('should handle undefined thread list without logging errors', async () => {
      const { result } = renderHook(() => useTogglePublicMutation(), {
        wrapper: createWrapper(queryClient),
      });

      queryClient.setQueryData(queryKeys.threads.all, undefined);

      result.current.mutate({
        threadId: 'thread-123',
        isPublic: true,
      });

      await waitFor(() => {
        expect(consoleSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('parseUsageStatsData - Undefined Query Handling', () => {
    it('should silently handle undefined usage stats without logging errors', async () => {
      const { result } = renderHook(() => useCreateThreadMutation(), {
        wrapper: createWrapper(queryClient),
      });

      queryClient.setQueryData(queryKeys.usage.stats(), undefined);

      result.current.mutate({
        json: {
          message: 'Test message',
          mode: 'debate',
          participants: [
            { modelId: 'gpt-4', role: 'user', priority: 1 },
          ],
        },
      });

      await waitFor(() => {
        expect(consoleSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('parseThreadDetailData - Undefined Query Handling', () => {
    it('should silently handle undefined thread detail without logging errors', async () => {
      const { result } = renderHook(() => useUpdateThreadMutation(), {
        wrapper: createWrapper(queryClient),
      });

      queryClient.setQueryData(queryKeys.threads.detail('thread-123'), undefined);

      result.current.mutate({
        param: { id: 'thread-123' },
        json: { title: 'Updated Title' },
      });

      await waitFor(() => {
        expect(consoleSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('edge Cases - Empty and Invalid Data', () => {
    it('should handle empty pages array gracefully', async () => {
      const { result } = renderHook(() => useUpdateThreadMutation(), {
        wrapper: createWrapper(queryClient),
      });

      queryClient.setQueryData(queryKeys.threads.all, {
        pages: [],
        pageParams: [],
      });

      result.current.mutate({
        param: { id: 'thread-123' },
        json: { title: 'Updated Title' },
      });

      await waitFor(() => {
        // Should not log errors for valid but empty structure
        expect(consoleSpy).not.toHaveBeenCalled();

        const cachedData = queryClient.getQueryData(queryKeys.threads.all) as {
          pages: unknown[];
        };
        expect(cachedData.pages).toHaveLength(0);
      });
    });

    it('should handle pages with invalid items gracefully', async () => {
      const { result } = renderHook(() => useUpdateThreadMutation(), {
        wrapper: createWrapper(queryClient),
      });

      queryClient.setQueryData(queryKeys.threads.all, {
        pages: [
          {
            success: true,
            data: {
              items: [
                { id: 'invalid-thread' }, // Missing required fields
              ],
            },
          },
        ],
        pageParams: [undefined],
      });

      result.current.mutate({
        param: { id: 'thread-123' },
        json: { title: 'Updated Title' },
      });

      await waitFor(() => {
        // Should validate and skip invalid items
        const cachedData = queryClient.getQueryData(queryKeys.threads.all);
        expect(cachedData).toBeDefined();
      });
    });
  });

  describe('rollback Scenarios', () => {
    it('should preserve undefined state during optimistic update rollback', async () => {
      const { result } = renderHook(() => useUpdateThreadMutation(), {
        wrapper: createWrapper(queryClient),
      });

      // Start with undefined (uninitialized query)
      queryClient.setQueryData(queryKeys.threads.all, undefined);

      // Trigger mutation (will save previousThreads as undefined)
      result.current.mutate({
        param: { id: 'thread-123' },
        json: { title: 'Updated Title' },
      });

      await waitFor(() => {
        // Should remain undefined (no error thrown, no crash)
        const cachedData = queryClient.getQueryData(queryKeys.threads.all);
        expect(cachedData).toBeUndefined();
      });
    });
  });
});
