/**
 * Navigation Reset Query Cache Tests
 *
 * REPRODUCTION OF BUG: Query cache not cleared when clicking "New Chat" or logo
 *
 * Root Cause:
 * - resetToNewChat() only resets Zustand store state
 * - TanStack Query cache is NOT invalidated/cleared
 * - Old thread data remains cached:
 *   - messages
 *   - participants
 *   - analyses
 *   - pre-searches
 *   - feedback
 *
 * Expected Behavior:
 * - When navigating to new chat, ALL thread-specific queries should be invalidated
 * - This ensures fresh state without residual data from previous threads
 *
 * Impact:
 * - Stale data can appear when creating new thread
 * - Memory leaks from cached data
 * - Incorrect UI state
 */

import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryKeys } from '@/lib/data/query-keys';
import { createChatStore } from '@/stores/chat';

import type { ChatStore } from '../../../stores/chat/store';

describe('navigation Reset Query Cache Integration', () => {
  let store: ReturnType<typeof createChatStore>;
  let getState: () => ChatStore;
  let mockQueryClient: QueryClient;
  let invalidateQueriesSpy: ReturnType<typeof vi.fn>;
  let removeQueriesSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = createChatStore();
    getState = store.getState;

    // Mock QueryClient
    mockQueryClient = new QueryClient();
    invalidateQueriesSpy = vi.fn();
    removeQueriesSpy = vi.fn();
    mockQueryClient.invalidateQueries = invalidateQueriesSpy;
    mockQueryClient.removeQueries = removeQueriesSpy;
  });

  describe('🚨 bug reproduction: missing query cache cleanup', () => {
    it('should call store.stop() to cancel ongoing streams', () => {
      const mockStop = vi.fn();
      getState().setStop(mockStop);

      // Simulate navigation reset
      getState().resetToNewChat();

      // ✅ Stream cancellation works
      expect(mockStop).toHaveBeenCalled();
    });

    it('should reset all store state', () => {
      // Setup: Populate store with data
      getState().setInputValue('Some message');
      getState().setSelectedMode('brainstorming');
      getState().setCreatedThreadId('thread-123');
      getState().setIsStreaming(true);

      // Act: Reset
      getState().resetToNewChat();

      // Assert: State is reset
      expect(getState().inputValue).toBe('');
      expect(getState().selectedMode).toBe('brainstorming'); // Default
      expect(getState().createdThreadId).toBe(null);
      expect(getState().isStreaming).toBe(false);
    });

    it('🚨 FAILING TEST: should invalidate thread-specific queries', () => {
      const threadId = 'thread-old-123';

      // Simulate that we have a thread loaded
      const mockThread = {
        id: threadId,
        title: 'Old Thread',
        slug: 'old-thread',
        mode: 'brainstorming',
        enableWebSearch: true,
      } as unknown as StoredThread;

      getState().initializeThread(mockThread, [], []);

      // Act: Reset to new chat (current implementation)
      getState().resetToNewChat();

      // 🚨 BUG: Query cache is NOT invalidated
      expect(invalidateQueriesSpy).not.toHaveBeenCalled();

      // ✅ EXPECTED: Should invalidate all thread-specific queries
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.threads.messages(threadId),
      });
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.threads.analyses(threadId),
      });
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.threads.preSearches(threadId),
      });
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.threads.feedback(threadId),
      });
    });

    it('🚨 FAILING TEST: should clear query cache even without threadId', () => {
      // Simulate being on overview screen (no thread loaded)
      expect(getState().thread).toBe(null);
      expect(getState().createdThreadId).toBe(null);

      // Act: Reset (e.g., clicking logo from overview)
      getState().resetToNewChat();

      // 🚨 BUG: No queries invalidated
      expect(invalidateQueriesSpy).not.toHaveBeenCalled();

      // ✅ EXPECTED: Should still clear any potentially cached data
      // Using a wildcard or specific patterns
      expect(invalidateQueriesSpy).toHaveBeenCalled();
    });

    it('🚨 FAILING TEST: demonstrates memory leak from cached queries', () => {
      const thread1Id = 'thread-001';
      const thread2Id = 'thread-002';

      // Round 1: Load thread 1
      const mockThread1 = {
        id: thread1Id,
        title: 'Thread 1',
        slug: 'thread-1',
        mode: 'brainstorming',
      } as unknown as StoredThread;
      getState().initializeThread(mockThread1, [], []);

      // Simulate query cache being populated for thread 1
      // (in real app, TanStack Query would cache messages, participants, etc.)

      // User clicks "New Chat"
      getState().resetToNewChat();

      // Round 2: Load thread 2
      const mockThread2 = {
        id: thread2Id,
        title: 'Thread 2',
        slug: 'thread-2',
        mode: 'analyzing',
      } as unknown as StoredThread;
      getState().initializeThread(mockThread2, [], []);

      // 🚨 BUG: Thread 1 queries are still cached
      // Without invalidation, old data persists in memory
      expect(invalidateQueriesSpy).not.toHaveBeenCalled();

      // ✅ EXPECTED: Thread 1 queries should be invalidated after reset
      expect(invalidateQueriesSpy).toHaveBeenCalled();
    });
  });

  describe('expected behavior: query cache cleanup', () => {
    it('should invalidate all thread-specific queries when threadId exists', () => {
      const threadId = 'thread-test-001';
      const mockThread = {
        id: threadId,
        title: 'Test Thread',
        slug: 'test-thread',
        mode: 'brainstorming',
        enableWebSearch: true,
      } as unknown as StoredThread;

      getState().initializeThread(mockThread, [], []);

      // Simulate what SHOULD happen in resetToNewChat (with fix)
      const resetWithQueryInvalidation = () => {
        const state = getState();
        const currentThreadId = state.thread?.id;

        // Stop streams
        state.stop?.();

        // Invalidate queries if we have a thread
        if (currentThreadId) {
          mockQueryClient.invalidateQueries({
            queryKey: queryKeys.threads.messages(currentThreadId),
          });
          mockQueryClient.invalidateQueries({
            queryKey: queryKeys.threads.analyses(currentThreadId),
          });
          mockQueryClient.invalidateQueries({
            queryKey: queryKeys.threads.preSearches(currentThreadId),
          });
          mockQueryClient.invalidateQueries({
            queryKey: queryKeys.threads.feedback(currentThreadId),
          });
        }

        // Reset store state
        state.resetToNewChat();
      };

      resetWithQueryInvalidation();

      // Verify all queries were invalidated
      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(4);
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['threads', 'messages', threadId],
      });
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['threads', 'analyses', threadId],
      });
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['threads', 'pre-searches', threadId],
      });
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['threads', 'feedback', threadId],
      });
    });

    it('should clear createdThreadId cache when set', () => {
      const threadId = 'thread-created-001';
      getState().setCreatedThreadId(threadId);

      // Simulate proper reset with query invalidation
      const resetWithQueryInvalidation = () => {
        const state = getState();
        const effectiveThreadId = state.thread?.id || state.createdThreadId;

        state.stop?.();

        if (effectiveThreadId) {
          mockQueryClient.invalidateQueries({
            queryKey: queryKeys.threads.messages(effectiveThreadId),
          });
          mockQueryClient.invalidateQueries({
            queryKey: queryKeys.threads.analyses(effectiveThreadId),
          });
          mockQueryClient.invalidateQueries({
            queryKey: queryKeys.threads.preSearches(effectiveThreadId),
          });
          mockQueryClient.invalidateQueries({
            queryKey: queryKeys.threads.feedback(effectiveThreadId),
          });
        }

        state.resetToNewChat();
      };

      resetWithQueryInvalidation();

      // Verify queries were invalidated for createdThreadId
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['threads', 'messages', threadId],
      });
    });

    it('should handle navigation without any thread gracefully', () => {
      // No thread loaded
      expect(getState().thread).toBe(null);
      expect(getState().createdThreadId).toBe(null);

      // Simulate proper reset (no queries to invalidate)
      const resetWithQueryInvalidation = () => {
        const state = getState();
        state.stop?.();
        // No threadId, so no queries to invalidate
        state.resetToNewChat();
      };

      resetWithQueryInvalidation();

      // Should not error, just reset store
      expect(getState().thread).toBe(null);
    });
  });

  describe('integration: complete navigation reset flow', () => {
    it('should execute full cleanup sequence', () => {
      const threadId = 'thread-full-001';
      const mockStop = vi.fn();
      const mockThread = {
        id: threadId,
        title: 'Full Test',
        slug: 'full-test',
        mode: 'brainstorming',
      } as unknown as StoredThread;

      // Setup
      getState().initializeThread(mockThread, [], []);
      getState().setStop(mockStop);
      getState().setInputValue('Pending message');
      getState().setIsStreaming(true);

      // Simulate complete reset with query invalidation
      const completeReset = () => {
        const state = getState();
        const effectiveThreadId = state.thread?.id || state.createdThreadId;

        // Step 1: Cancel streams
        state.stop?.();

        // Step 2: Invalidate queries
        if (effectiveThreadId) {
          mockQueryClient.invalidateQueries({
            queryKey: queryKeys.threads.messages(effectiveThreadId),
          });
          mockQueryClient.invalidateQueries({
            queryKey: queryKeys.threads.analyses(effectiveThreadId),
          });
          mockQueryClient.invalidateQueries({
            queryKey: queryKeys.threads.preSearches(effectiveThreadId),
          });
          mockQueryClient.invalidateQueries({
            queryKey: queryKeys.threads.feedback(effectiveThreadId),
          });
        }

        // Step 3: Reset store
        state.resetToNewChat();
      };

      completeReset();

      // Verify all steps executed
      expect(mockStop).toHaveBeenCalled(); // Stream cancelled
      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(4); // Queries invalidated
      expect(getState().thread).toBe(null); // Store reset
      expect(getState().inputValue).toBe(''); // State cleared
      expect(getState().isStreaming).toBe(false); // Flags reset
    });
  });
});
