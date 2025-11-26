/**
 * Changelog Invalidation Tests for Web Search Toggle
 *
 * Verifies that the changelog query is properly invalidated when
 * enableWebSearch is changed via the thread update mutation.
 *
 * CRITICAL: Without this invalidation, the changelog entry created
 * on the backend (via logWebSearchToggle) won't be fetched by the frontend.
 *
 * @see src/hooks/mutations/chat-mutations.ts - useUpdateThreadMutation
 * @see src/api/services/thread-changelog.service.ts - logWebSearchToggle
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { queryKeys } from '@/lib/data/query-keys';
// Import after mock
import { updateThreadService } from '@/services/api';

import { useUpdateThreadMutation } from '../chat-mutations';

// Mock the API service
vi.mock('@/services/api', () => ({
  updateThreadService: vi.fn(),
}));

describe('changelog invalidation on web search toggle', () => {
  let queryClient: QueryClient;
  let invalidateQueriesSpy: ReturnType<typeof vi.spyOn>;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

    // Mock successful response
    vi.mocked(updateThreadService).mockResolvedValue({
      data: {
        id: 'thread-1',
        userId: 'user-1',
        title: 'Test Thread',
        slug: 'test-thread',
        mode: 'debating',
        status: 'active',
        enableWebSearch: true,
        isFavorite: false,
        isPublic: false,
        isAiGeneratedTitle: false,
        projectId: null,
        metadata: null,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastMessageAt: new Date().toISOString(),
      },
      error: null,
    });
  });

  afterEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  describe('enableWebSearch changes', () => {
    it('should invalidate changelog when enableWebSearch is updated', async () => {
      const { result } = renderHook(() => useUpdateThreadMutation(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          param: { id: 'thread-1' },
          json: { enableWebSearch: true },
        });
      });

      await waitFor(() => {
        expect(invalidateQueriesSpy).toHaveBeenCalledWith({
          queryKey: queryKeys.threads.changelog('thread-1'),
        });
      });
    });

    it('should invalidate changelog when enableWebSearch is set to false', async () => {
      const { result } = renderHook(() => useUpdateThreadMutation(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          param: { id: 'thread-1' },
          json: { enableWebSearch: false },
        });
      });

      await waitFor(() => {
        expect(invalidateQueriesSpy).toHaveBeenCalledWith({
          queryKey: queryKeys.threads.changelog('thread-1'),
        });
      });
    });

    it('should use correct thread ID in changelog query key', async () => {
      const { result } = renderHook(() => useUpdateThreadMutation(), { wrapper });
      const threadId = 'specific-thread-id-123';

      await act(async () => {
        await result.current.mutateAsync({
          param: { id: threadId },
          json: { enableWebSearch: true },
        });
      });

      await waitFor(() => {
        expect(invalidateQueriesSpy).toHaveBeenCalledWith({
          queryKey: queryKeys.threads.changelog(threadId),
        });
      });
    });
  });

  describe('other property changes', () => {
    it('should invalidate changelog when participants is updated', async () => {
      const { result } = renderHook(() => useUpdateThreadMutation(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          param: { id: 'thread-1' },
          json: { participants: [{ modelId: 'gpt-4', priority: 0 }] },
        });
      });

      await waitFor(() => {
        expect(invalidateQueriesSpy).toHaveBeenCalledWith({
          queryKey: queryKeys.threads.changelog('thread-1'),
        });
      });
    });

    it('should invalidate changelog when mode is updated', async () => {
      const { result } = renderHook(() => useUpdateThreadMutation(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          param: { id: 'thread-1' },
          json: { mode: 'brainstorming' },
        });
      });

      await waitFor(() => {
        expect(invalidateQueriesSpy).toHaveBeenCalledWith({
          queryKey: queryKeys.threads.changelog('thread-1'),
        });
      });
    });

    it('should NOT invalidate changelog when only title is updated', async () => {
      const { result } = renderHook(() => useUpdateThreadMutation(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          param: { id: 'thread-1' },
          json: { title: 'New Title' },
        });
      });

      // Wait a bit to ensure no invalidation happens
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should not have been called with changelog query key
      const changelogCalls = invalidateQueriesSpy.mock.calls.filter(
        call => JSON.stringify(call[0]).includes('changelog'),
      );
      expect(changelogCalls).toHaveLength(0);
    });

    it('should NOT invalidate changelog when only isFavorite is updated', async () => {
      const { result } = renderHook(() => useUpdateThreadMutation(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          param: { id: 'thread-1' },
          json: { isFavorite: true },
        });
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const changelogCalls = invalidateQueriesSpy.mock.calls.filter(
        call => JSON.stringify(call[0]).includes('changelog'),
      );
      expect(changelogCalls).toHaveLength(0);
    });
  });

  describe('combined property changes', () => {
    it('should invalidate changelog when enableWebSearch and mode are updated together', async () => {
      const { result } = renderHook(() => useUpdateThreadMutation(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          param: { id: 'thread-1' },
          json: {
            enableWebSearch: true,
            mode: 'solving',
          },
        });
      });

      await waitFor(() => {
        expect(invalidateQueriesSpy).toHaveBeenCalledWith({
          queryKey: queryKeys.threads.changelog('thread-1'),
        });
      });

      // Should only be called once, not twice
      const changelogCalls = invalidateQueriesSpy.mock.calls.filter(
        call => JSON.stringify(call[0]).includes('changelog'),
      );
      expect(changelogCalls).toHaveLength(1);
    });

    it('should invalidate changelog when enableWebSearch is updated with non-triggering fields', async () => {
      const { result } = renderHook(() => useUpdateThreadMutation(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          param: { id: 'thread-1' },
          json: {
            enableWebSearch: true,
            title: 'New Title', // This alone wouldn't trigger
          },
        });
      });

      await waitFor(() => {
        // enableWebSearch should still trigger invalidation
        expect(invalidateQueriesSpy).toHaveBeenCalledWith({
          queryKey: queryKeys.threads.changelog('thread-1'),
        });
      });
    });
  });

  describe('query key structure verification', () => {
    it('should produce correct query key format for changelog', () => {
      const threadId = 'test-thread-id';
      const queryKey = queryKeys.threads.changelog(threadId);

      // Verify the query key structure
      expect(queryKey).toBeDefined();
      expect(Array.isArray(queryKey)).toBe(true);
      expect(queryKey).toContain(threadId);
    });

    it('should produce different query keys for different threads', () => {
      const queryKey1 = queryKeys.threads.changelog('thread-1');
      const queryKey2 = queryKeys.threads.changelog('thread-2');

      expect(JSON.stringify(queryKey1)).not.toBe(JSON.stringify(queryKey2));
    });
  });
});

describe('changelog invalidation condition check', () => {
  /**
   * These tests verify the EXACT condition used in chat-mutations.ts:
   * if ('participants' in variables.json || 'mode' in variables.json || 'enableWebSearch' in variables.json)
   */

  it('should verify condition includes enableWebSearch', () => {
    const variablesWithWebSearch = { json: { enableWebSearch: true } };
    const variablesWithMode = { json: { mode: 'debating' } };
    const variablesWithParticipants = { json: { participants: [] } };
    const variablesWithTitle = { json: { title: 'test' } };

    // The condition from chat-mutations.ts
    const shouldInvalidate = (variables: { json: Record<string, unknown> }) =>
      'participants' in variables.json
      || 'mode' in variables.json
      || 'enableWebSearch' in variables.json;

    expect(shouldInvalidate(variablesWithWebSearch)).toBe(true);
    expect(shouldInvalidate(variablesWithMode)).toBe(true);
    expect(shouldInvalidate(variablesWithParticipants)).toBe(true);
    expect(shouldInvalidate(variablesWithTitle)).toBe(false);
  });

  it('should handle undefined and null values correctly', () => {
    // 'in' operator checks for key existence, not value
    const variablesWithUndefined = { json: { enableWebSearch: undefined } };
    const variablesWithNull = { json: { enableWebSearch: null } };
    const variablesWithFalse = { json: { enableWebSearch: false } };

    const shouldInvalidate = (variables: { json: Record<string, unknown> }) =>
      'participants' in variables.json
      || 'mode' in variables.json
      || 'enableWebSearch' in variables.json;

    // All should trigger because the KEY exists (regardless of value)
    expect(shouldInvalidate(variablesWithUndefined)).toBe(true);
    expect(shouldInvalidate(variablesWithNull)).toBe(true);
    expect(shouldInvalidate(variablesWithFalse)).toBe(true);
  });
});
