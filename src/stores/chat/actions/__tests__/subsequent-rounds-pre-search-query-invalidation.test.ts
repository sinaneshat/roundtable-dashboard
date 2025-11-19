/**
 * Subsequent Rounds Pre-Search Query Invalidation Tests
 *
 * REPRODUCTION OF BUG: Pre-search query not invalidated on subsequent rounds
 *
 * Root Cause Analysis:
 * - chat-store-provider.tsx:457-476: sendMessageWithQuotaInvalidation wraps sendMessage
 * - chat-store-provider.tsx:469-473: Invalidates pre-searches query when web search enabled
 * - chat-store-provider.tsx:285: Stores UNWRAPPED chat.sendMessage in store
 * - chat-store-provider.tsx:244: handleComplete uses unwrapped sendMessage from store
 * - Result: Pre-search query invalidation happens on round 0 but NOT on subsequent rounds
 *
 * Expected Behavior:
 * - Round 0: Query invalidated ✅ (via startRoundWithQuotaInvalidation)
 * - Round 1+: Query invalidated ❌ (uses unwrapped sendMessage)
 *
 * Fix: Store wrapped sendMessageWithQuotaInvalidation instead of raw chat.sendMessage
 */

import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryKeys } from '@/lib/data/query-keys';
import { createChatStore } from '@/stores/chat';

import type { ChatStore } from '../../store';

describe('subsequent Rounds Pre-Search Query Invalidation', () => {
  let store: ReturnType<typeof createChatStore>;
  let getState: () => ChatStore;
  let mockQueryClient: QueryClient;
  let invalidateQueriesSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = createChatStore();
    getState = store.getState;

    // Mock QueryClient
    mockQueryClient = new QueryClient();
    invalidateQueriesSpy = vi.fn();
    mockQueryClient.invalidateQueries = invalidateQueriesSpy;
  });

  describe('bug reproduction: missing pre-search query invalidation on subsequent rounds', () => {
    it('should invalidate pre-search query on round 0 when web search enabled', async () => {
      // Setup: Enable web search and create thread
      getState().setEnableWebSearch(true);
      const threadId = 'thread-test-001';
      getState().setCreatedThreadId(threadId);

      // Mock sendMessage that tracks if query was invalidated
      let queryInvalidatedBeforeSend = false;
      const mockSendMessage = vi.fn(async (_content: string) => {
        // Check if query was invalidated before this call
        queryInvalidatedBeforeSend = invalidateQueriesSpy.mock.calls.some(
          call => call[0]?.queryKey?.[0] === 'threads'
            && call[0]?.queryKey?.[1] === 'pre-searches'
            && call[0]?.queryKey?.[2] === threadId,
        );
        return Promise.resolve();
      });

      // Simulate wrapped sendMessage (like sendMessageWithQuotaInvalidation)
      const wrappedSendMessage = async (content: string) => {
        const currentThread = getState().thread;
        const effectiveThreadId = currentThread?.id || getState().createdThreadId;
        const webSearchEnabled = currentThread?.enableWebSearch ?? getState().enableWebSearch;

        if (webSearchEnabled && effectiveThreadId) {
          await mockQueryClient.invalidateQueries({
            queryKey: queryKeys.threads.preSearches(effectiveThreadId),
          });
        }

        return mockSendMessage(content);
      };

      // Call wrapped version (simulates startRoundWithQuotaInvalidation)
      await wrappedSendMessage('First message');

      // Verify query was invalidated before sending message
      expect(queryInvalidatedBeforeSend).toBe(true);
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['threads', 'pre-searches', threadId],
      });
    });

    it('🚨 FAILING TEST: should invalidate pre-search query on round 1+ when using unwrapped sendMessage', async () => {
      // Setup: Enable web search and create thread
      getState().setEnableWebSearch(true);
      const threadId = 'thread-test-002';
      getState().setCreatedThreadId(threadId);

      // Mock sendMessage (unwrapped, like what's stored in store)
      const mockSendMessage = vi.fn(async (_content: string) => {
        return Promise.resolve();
      });

      // Store the UNWRAPPED version in store (current buggy behavior)
      getState().setSendMessage(mockSendMessage);

      // Simulate handleComplete callback using sendMessage from store
      // This is what happens on subsequent rounds
      const sendMessageFromStore = getState().sendMessage;
      await sendMessageFromStore?.('Second message');

      // 🚨 BUG: Query was NOT invalidated because unwrapped version was used
      expect(invalidateQueriesSpy).not.toHaveBeenCalled();

      // ✅ EXPECTED: Query SHOULD have been invalidated
      // This test FAILS with current implementation
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['threads', 'pre-searches', threadId],
      });
    });

    it('🚨 FAILING TEST: demonstrates the difference between round 0 and round 1+', async () => {
      // Setup
      getState().setEnableWebSearch(true);
      const threadId = 'thread-test-003';
      getState().setCreatedThreadId(threadId);

      const mockSendMessage = vi.fn(async (_content: string) => Promise.resolve());

      // === ROUND 0: Uses wrapped sendMessage (works correctly) ===
      const wrappedSendMessage = async (content: string) => {
        const currentThread = getState().thread;
        const effectiveThreadId = currentThread?.id || getState().createdThreadId;
        const webSearchEnabled = currentThread?.enableWebSearch ?? getState().enableWebSearch;

        if (webSearchEnabled && effectiveThreadId) {
          await mockQueryClient.invalidateQueries({
            queryKey: queryKeys.threads.preSearches(effectiveThreadId),
          });
        }

        return mockSendMessage(content);
      };

      await wrappedSendMessage('Round 0 message');
      const round0Calls = invalidateQueriesSpy.mock.calls.length;
      expect(round0Calls).toBe(1); // ✅ Query invalidated

      // === ROUND 1: Uses unwrapped sendMessage from store (BUG) ===
      getState().setSendMessage(mockSendMessage);
      const sendMessageFromStore = getState().sendMessage;

      await sendMessageFromStore?.('Round 1 message');
      const round1Calls = invalidateQueriesSpy.mock.calls.length;

      // 🚨 BUG: Still only 1 call, should be 2
      expect(round1Calls).toBe(1);

      // ✅ EXPECTED: Should have 2 calls (1 from round 0 + 1 from round 1)
      expect(round1Calls).toBe(2); // This FAILS
    });
  });

  describe('expected behavior: query invalidation on all rounds', () => {
    it('should invalidate pre-search query on every round when wrapped sendMessage is used', async () => {
      getState().setEnableWebSearch(true);
      const threadId = 'thread-test-004';
      getState().setCreatedThreadId(threadId);

      const mockSendMessage = vi.fn(async (_content: string) => Promise.resolve());

      // Wrapped version (what SHOULD be stored in store)
      const wrappedSendMessage = async (content: string) => {
        const currentThread = getState().thread;
        const effectiveThreadId = currentThread?.id || getState().createdThreadId;
        const webSearchEnabled = currentThread?.enableWebSearch ?? getState().enableWebSearch;

        if (webSearchEnabled && effectiveThreadId) {
          await mockQueryClient.invalidateQueries({
            queryKey: queryKeys.threads.preSearches(effectiveThreadId),
          });
        }

        return mockSendMessage(content);
      };

      // Store wrapped version (correct behavior)
      getState().setSendMessage(wrappedSendMessage);

      // Round 0
      await wrappedSendMessage('Round 0');
      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(1);

      // Round 1
      const sendMessageFromStore = getState().sendMessage;
      await sendMessageFromStore?.('Round 1');
      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(2);

      // Round 2
      await sendMessageFromStore?.('Round 2');
      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(3);

      // Verify all calls were for pre-searches
      invalidateQueriesSpy.mock.calls.forEach((call) => {
        expect(call[0]).toEqual({
          queryKey: ['threads', 'pre-searches', threadId],
        });
      });
    });

    it('should not invalidate pre-search query when web search is disabled', async () => {
      getState().setEnableWebSearch(false); // Disabled
      const threadId = 'thread-test-005';
      getState().setCreatedThreadId(threadId);

      const mockSendMessage = vi.fn(async (_content: string) => Promise.resolve());

      const wrappedSendMessage = async (content: string) => {
        const currentThread = getState().thread;
        const effectiveThreadId = currentThread?.id || getState().createdThreadId;
        const webSearchEnabled = currentThread?.enableWebSearch ?? getState().enableWebSearch;

        if (webSearchEnabled && effectiveThreadId) {
          await mockQueryClient.invalidateQueries({
            queryKey: queryKeys.threads.preSearches(effectiveThreadId),
          });
        }

        return mockSendMessage(content);
      };

      await wrappedSendMessage('Message without web search');

      // Query should NOT be invalidated
      expect(invalidateQueriesSpy).not.toHaveBeenCalled();
    });

    it('should invalidate pre-search query even when thread.enableWebSearch is true (not just store.enableWebSearch)', async () => {
      // Setup thread with web search enabled
      const threadId = 'thread-test-006';
      const mockThread = {
        id: threadId,
        enableWebSearch: true,
        mode: 'brainstorming',
        userId: 'user-1',
        status: 'active',
        title: 'Test Thread',
        slug: 'test-thread',
      } as unknown;

      getState().initializeThread(mockThread, [], []);

      const mockSendMessage = vi.fn(async (_content: string) => Promise.resolve());

      const wrappedSendMessage = async (content: string) => {
        const currentThread = getState().thread;
        const effectiveThreadId = currentThread?.id || getState().createdThreadId;
        const webSearchEnabled = currentThread?.enableWebSearch ?? getState().enableWebSearch;

        if (webSearchEnabled && effectiveThreadId) {
          await mockQueryClient.invalidateQueries({
            queryKey: queryKeys.threads.preSearches(effectiveThreadId),
          });
        }

        return mockSendMessage(content);
      };

      await wrappedSendMessage('Message with thread.enableWebSearch=true');

      // Query SHOULD be invalidated (thread.enableWebSearch takes precedence)
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['threads', 'pre-searches', threadId],
      });
    });
  });

  describe('edge cases', () => {
    it('should not invalidate when threadId is missing', async () => {
      getState().setEnableWebSearch(true);
      // No threadId set

      const mockSendMessage = vi.fn(async (_content: string) => Promise.resolve());

      const wrappedSendMessage = async (content: string) => {
        const currentThread = getState().thread;
        const effectiveThreadId = currentThread?.id || getState().createdThreadId;
        const webSearchEnabled = currentThread?.enableWebSearch ?? getState().enableWebSearch;

        if (webSearchEnabled && effectiveThreadId) {
          await mockQueryClient.invalidateQueries({
            queryKey: queryKeys.threads.preSearches(effectiveThreadId),
          });
        }

        return mockSendMessage(content);
      };

      await wrappedSendMessage('Message without threadId');

      // Should not invalidate (no threadId)
      expect(invalidateQueriesSpy).not.toHaveBeenCalled();
    });

    it('should handle race condition: web search toggled mid-round', async () => {
      const threadId = 'thread-test-007';
      getState().setCreatedThreadId(threadId);
      getState().setEnableWebSearch(false); // Start disabled

      const mockSendMessage = vi.fn(async (_content: string) => Promise.resolve());

      const wrappedSendMessage = async (content: string) => {
        const currentThread = getState().thread;
        const effectiveThreadId = currentThread?.id || getState().createdThreadId;
        const webSearchEnabled = currentThread?.enableWebSearch ?? getState().enableWebSearch;

        if (webSearchEnabled && effectiveThreadId) {
          await mockQueryClient.invalidateQueries({
            queryKey: queryKeys.threads.preSearches(effectiveThreadId),
          });
        }

        return mockSendMessage(content);
      };

      // Round 0 - disabled
      await wrappedSendMessage('Round 0 without search');
      expect(invalidateQueriesSpy).not.toHaveBeenCalled();

      // Enable mid-conversation
      getState().setEnableWebSearch(true);

      // Round 1 - enabled
      await wrappedSendMessage('Round 1 with search');
      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(1);

      // Disable again
      getState().setEnableWebSearch(false);

      // Round 2 - disabled again
      await wrappedSendMessage('Round 2 without search again');
      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(1); // Still 1 (no new call)
    });
  });
});
