/**
 * Pre-Search Query Invalidation Integration Tests
 *
 * Tests the full integration flow of pre-search query invalidation
 * from ChatStoreProvider through to QueryClient.
 *
 * BUG REPRODUCTION:
 * - Round 0: Pre-search query invalidated ✅
 * - Round 1+: Pre-search query NOT invalidated ❌
 *
 * Root Cause:
 * - Provider stores unwrapped `chat.sendMessage` in store
 * - handleComplete callback uses unwrapped version from store
 * - Query invalidation only happens in wrapped version
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatStoreProvider, useChatStore } from '@/components/providers/chat-store-provider';

// Mock useMultiParticipantChat hook
vi.mock('@/hooks/utils', () => ({
  useMultiParticipantChat: vi.fn(() => ({
    sendMessage: vi.fn(async (_content: string) => Promise.resolve()),
    startRound: vi.fn(),
    stop: vi.fn(),
    setMessages: vi.fn(),
    retry: vi.fn(),
    messages: [],
    isStreaming: false,
    currentParticipantIndex: 0,
  })),
}));

// Mock usePathname
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/chat/test'),
}));

describe('pre-Search Query Invalidation Integration', () => {
  let queryClient: QueryClient;
  let invalidateQueriesSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    invalidateQueriesSpy = vi.fn();
    queryClient.invalidateQueries = invalidateQueriesSpy;
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ChatStoreProvider>
        {children}
      </ChatStoreProvider>
    </QueryClientProvider>
  );

  describe('bug reproduction: query invalidation', () => {
    it('🚨 FAILING TEST: should invalidate pre-search query when sendMessage is called from handleComplete', async () => {
      const { result } = renderHook(() => useChatStore(), { wrapper });

      // Setup: Enable web search and create thread
      const threadId = 'thread-integration-001';
      result.current.setEnableWebSearch(true);
      result.current.setCreatedThreadId(threadId);

      // Get sendMessage from store (this is what handleComplete uses)
      const sendMessage = result.current.sendMessage;

      // Clear any previous calls
      invalidateQueriesSpy.mockClear();

      // Call sendMessage (simulating handleComplete behavior)
      await sendMessage?.('Test message from handleComplete');

      await waitFor(() => {
        // ✅ FIXED: Query invalidation IS now called (wrapped sendMessage is stored)
        // Each sendMessage call invalidates 2 queries: usage.stats() + threads.preSearches()
        expect(invalidateQueriesSpy).toHaveBeenCalled();
      });

      // Verify pre-search query was invalidated
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['threads', 'pre-searches', threadId],
      });
    });

    it('should track invalidation calls across multiple rounds', async () => {
      const { result } = renderHook(() => useChatStore(), { wrapper });

      const threadId = 'thread-integration-002';
      result.current.setEnableWebSearch(true);
      result.current.setCreatedThreadId(threadId);

      const sendMessage = result.current.sendMessage;
      invalidateQueriesSpy.mockClear();

      // Round 0
      await sendMessage?.('Round 0 message');

      // Round 1
      await sendMessage?.('Round 1 message');

      // Round 2
      await sendMessage?.('Round 2 message');

      await waitFor(() => {
        // ✅ FIXED: Should have 6 invalidation calls total (2 per round × 3 rounds)
        // Each sendMessage invalidates: usage.stats() + threads.preSearches()
        expect(invalidateQueriesSpy).toHaveBeenCalledTimes(6);

        // Verify pre-search query was invalidated for each round
        const preSearchCalls = invalidateQueriesSpy.mock.calls.filter(
          call => call[0]?.queryKey?.[1] === 'pre-searches',
        );
        expect(preSearchCalls).toHaveLength(3); // 3 rounds
        preSearchCalls.forEach((call) => {
          expect(call[0]).toEqual({
            queryKey: ['threads', 'pre-searches', threadId],
          });
        });
      });
    });

    it('should not invalidate pre-search query when web search is disabled', async () => {
      const { result } = renderHook(() => useChatStore(), { wrapper });

      const threadId = 'thread-integration-003';
      result.current.setEnableWebSearch(false); // Disabled
      result.current.setCreatedThreadId(threadId);

      const sendMessage = result.current.sendMessage;
      invalidateQueriesSpy.mockClear();

      await sendMessage?.('Message without web search');

      await waitFor(() => {
        // Should still invalidate usage.stats() (always called)
        expect(invalidateQueriesSpy).toHaveBeenCalledTimes(1);

        // But NOT pre-search query when web search is disabled
        const preSearchCalls = invalidateQueriesSpy.mock.calls.filter(
          call => call[0]?.queryKey?.[1] === 'pre-searches',
        );
        expect(preSearchCalls).toHaveLength(0);
      });
    });

    it('should invalidate when thread.enableWebSearch is true', async () => {
      const { result } = renderHook(() => useChatStore(), { wrapper });

      const threadId = 'thread-integration-004';
      const mockThread = {
        id: threadId,
        enableWebSearch: true,
        mode: 'brainstorming',
        userId: 'user-1',
        status: 'active',
        title: 'Test Thread',
        slug: 'test-thread',
      } as unknown;

      result.current.initializeThread(mockThread, [], []);
      invalidateQueriesSpy.mockClear();

      const sendMessage = result.current.sendMessage;
      await sendMessage?.('Message with thread.enableWebSearch=true');

      await waitFor(() => {
        // ✅ EXPECTED: Should invalidate when thread.enableWebSearch is true
        expect(invalidateQueriesSpy).toHaveBeenCalledWith({
          queryKey: ['threads', 'pre-searches', threadId],
        });
      });
    });

    it('should handle web search toggle mid-conversation', async () => {
      const { result } = renderHook(() => useChatStore(), { wrapper });

      const threadId = 'thread-integration-005';
      result.current.setEnableWebSearch(false); // Start disabled
      result.current.setCreatedThreadId(threadId);

      const sendMessage = result.current.sendMessage;
      invalidateQueriesSpy.mockClear();

      // Round 0 - disabled
      await sendMessage?.('Round 0 without search');

      await waitFor(() => {
        // Should have 1 call for usage.stats() (always invalidated)
        expect(invalidateQueriesSpy).toHaveBeenCalledTimes(1);

        // But NO pre-search query invalidation (web search disabled)
        const preSearchCalls = invalidateQueriesSpy.mock.calls.filter(
          call => call[0]?.queryKey?.[1] === 'pre-searches',
        );
        expect(preSearchCalls).toHaveLength(0);
      });

      // Enable mid-conversation
      result.current.setEnableWebSearch(true);

      // Round 1 - enabled
      await sendMessage?.('Round 1 with search');

      await waitFor(() => {
        // ✅ FIXED: Should have 3 total calls:
        // Round 0: usage.stats()
        // Round 1: usage.stats() + threads.preSearches()
        expect(invalidateQueriesSpy).toHaveBeenCalledTimes(3);

        // Verify pre-search query was invalidated once (round 1 only)
        const preSearchCalls = invalidateQueriesSpy.mock.calls.filter(
          call => call[0]?.queryKey?.[1] === 'pre-searches',
        );
        expect(preSearchCalls).toHaveLength(1);
      });
    });
  });

  describe('expected behavior after fix', () => {
    it('should consistently invalidate pre-search query on every round when wrapped', async () => {
      const { result } = renderHook(() => useChatStore(), { wrapper });

      const threadId = 'thread-integration-006';
      result.current.setEnableWebSearch(true);
      result.current.setCreatedThreadId(threadId);

      // After fix, sendMessage from store should be the wrapped version
      const sendMessage = result.current.sendMessage;
      invalidateQueriesSpy.mockClear();

      // Simulate multiple rounds
      for (let i = 0; i < 5; i++) {
        await sendMessage?.(`Round ${i} message`);
      }

      await waitFor(() => {
        // ✅ After fix: Should have 10 invalidation calls (2 per round × 5 rounds)
        // Each sendMessage invalidates: usage.stats() + threads.preSearches()
        expect(invalidateQueriesSpy).toHaveBeenCalledTimes(10);

        // Verify pre-search query was invalidated for each round
        const preSearchCalls = invalidateQueriesSpy.mock.calls.filter(
          call => call[0]?.queryKey?.[1] === 'pre-searches',
        );
        expect(preSearchCalls).toHaveLength(5); // 5 rounds
      });
    });
  });
});
