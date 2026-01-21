/**
 * ChatStoreProvider V2 - Slug Change Detection Tests
 *
 * Tests the slug change detection logic in isolation.
 * The actual provider has many hook dependencies that make integration testing complex.
 * These tests verify the reset behavior triggered by slug changes.
 */

import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { invalidationPatterns } from '@/lib/data/query-keys';
import { createChatStore } from '@/stores/chat-v2';
import { reset } from '@/stores/chat-v2/reset';

/**
 * Simulates the slug change detection logic from ChatStoreProvider
 *
 * This mirrors the effect in provider.tsx:54-75
 */
function simulateSlugChangeEffect(params: {
  prevSlug: string | undefined;
  newSlug: string | undefined;
  store: ReturnType<typeof createChatStore>;
  queryClient: QueryClient;
}): { resetTriggered: boolean; invalidatedThreadId: string | null } {
  const { prevSlug, newSlug, store, queryClient } = params;
  let resetTriggered = false;
  let invalidatedThreadId: string | null = null;

  // This mirrors the condition in provider.tsx:58-72
  if (prevSlug !== undefined && newSlug !== undefined && prevSlug !== newSlug) {
    // Get previous thread ID before reset
    const prevThreadId = store.getState().thread?.id ?? null;

    // Reset store state for navigation
    reset(store, 'navigation');
    resetTriggered = true;

    // Invalidate previous thread's TanStack Query caches
    if (prevThreadId) {
      invalidatedThreadId = prevThreadId;
      invalidationPatterns.leaveThread(prevThreadId).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    }
  }

  return { resetTriggered, invalidatedThreadId };
}

describe('chatStoreProvider slug change detection', () => {
  let queryClient: QueryClient;
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    store = createChatStore();
    vi.clearAllMocks();
  });

  describe('reset triggering conditions', () => {
    it('triggers reset when slug changes from one thread to another', () => {
      // Set up store with thread data
      store.setState({
        thread: { id: 'tid-1', mode: 'council' } as never,
        changelog: [{ id: 'ch1', roundNumber: 1 }] as never,
        threadUser: { id: 'u1', name: 'User' } as never,
        messages: [{ id: 'm1', role: 'user', content: 'hello' }] as never,
      });

      const result = simulateSlugChangeEffect({
        prevSlug: 'thread-1',
        newSlug: 'thread-2',
        store,
        queryClient,
      });

      expect(result.resetTriggered).toBe(true);
      expect(store.getState().thread).toBeNull();
      expect(store.getState().changelog).toEqual([]);
      expect(store.getState().threadUser).toBeNull();
      expect(store.getState().messages).toEqual([]);
    });

    it('does NOT trigger reset on initial mount (undefined → defined)', () => {
      store.setState({
        thread: { id: 'tid-1' } as never,
        changelog: [{ id: 'ch1' }] as never,
      });

      const result = simulateSlugChangeEffect({
        prevSlug: undefined,
        newSlug: 'thread-1',
        store,
        queryClient,
      });

      expect(result.resetTriggered).toBe(false);
      expect(store.getState().thread).not.toBeNull();
      expect(store.getState().changelog).toHaveLength(1);
    });

    it('does NOT trigger reset when slug stays the same', () => {
      store.setState({
        thread: { id: 'tid-1' } as never,
        changelog: [{ id: 'ch1' }] as never,
      });

      const result = simulateSlugChangeEffect({
        prevSlug: 'thread-1',
        newSlug: 'thread-1',
        store,
        queryClient,
      });

      expect(result.resetTriggered).toBe(false);
      expect(store.getState().thread).not.toBeNull();
    });

    it('does NOT trigger reset when going to undefined (leaving thread)', () => {
      store.setState({
        thread: { id: 'tid-1' } as never,
      });

      const result = simulateSlugChangeEffect({
        prevSlug: 'thread-1',
        newSlug: undefined,
        store,
        queryClient,
      });

      expect(result.resetTriggered).toBe(false);
    });
  });

  describe('form preference preservation', () => {
    it('preserves form preferences when slug changes', () => {
      store.setState({
        thread: { id: 'tid-1' } as never,
        selectedMode: 'council',
        enableWebSearch: true,
        inputValue: 'draft message',
        selectedParticipants: [{ id: 'p1', modelId: 'gpt-4' }] as never,
      });

      simulateSlugChangeEffect({
        prevSlug: 'thread-1',
        newSlug: 'thread-2',
        store,
        queryClient,
      });

      // Form preferences preserved
      expect(store.getState().selectedMode).toBe('council');
      expect(store.getState().enableWebSearch).toBe(true);
      expect(store.getState().inputValue).toBe('draft message');
      expect(store.getState().selectedParticipants).toHaveLength(1);

      // Thread data cleared
      expect(store.getState().thread).toBeNull();
    });
  });

  describe('query invalidation', () => {
    it('invalidates previous thread queries when slug changes', () => {
      const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

      store.setState({
        thread: { id: 'tid-123' } as never,
      });

      const result = simulateSlugChangeEffect({
        prevSlug: 'thread-1',
        newSlug: 'thread-2',
        store,
        queryClient,
      });

      expect(result.invalidatedThreadId).toBe('tid-123');
      expect(invalidateQueriesSpy).toHaveBeenCalled();
    });

    it('does NOT invalidate if previous thread had no ID', () => {
      const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

      // No thread set (thread is null)

      const result = simulateSlugChangeEffect({
        prevSlug: 'thread-1',
        newSlug: 'thread-2',
        store,
        queryClient,
      });

      expect(result.invalidatedThreadId).toBeNull();
      expect(invalidateQueriesSpy).not.toHaveBeenCalled();
    });
  });

  describe('complete state reset', () => {
    it('clears all thread-related state on navigation', () => {
      // Set up complete thread state
      const preSearches = new Map([[1, { roundNumber: 1, status: 'complete', query: 'test' }]]);
      const feedbackByRound = new Map([[1, 'like' as const]]);

      store.setState({
        thread: { id: 'tid-1', mode: 'council' } as never,
        participants: [{ id: 'p1' }] as never,
        messages: [{ id: 'm1' }] as never,
        changelog: [{ id: 'ch1' }] as never,
        threadUser: { id: 'u1' } as never,
        preSearches,
        feedbackByRound,
        hasInitiallyLoaded: true,
        displayedTitle: 'Old Title',
        targetTitle: 'Target',
        isTitleAnimating: true,
        flow: { type: 'round_complete', threadId: 'tid-1', round: 2 },
        createdThreadId: 'tid-1',
        createdSlug: 'thread-1',
      } as never);

      simulateSlugChangeEffect({
        prevSlug: 'thread-1',
        newSlug: 'thread-2',
        store,
        queryClient,
      });

      const state = store.getState();

      // Thread domain cleared
      expect(state.thread).toBeNull();
      expect(state.participants).toEqual([]);
      expect(state.messages).toEqual([]);
      expect(state.changelog).toEqual([]);
      expect(state.threadUser).toBeNull();
      expect(state.error).toBeNull();

      // Round domain cleared
      expect(state.flow.type).toBe('idle');
      expect(state.createdThreadId).toBeNull();
      expect(state.createdSlug).toBeNull();

      // PreSearch/Feedback cleared
      expect(state.preSearches.size).toBe(0);
      expect(state.feedbackByRound.size).toBe(0);

      // UI state cleared
      expect(state.hasInitiallyLoaded).toBe(false);
      expect(state.displayedTitle).toBeNull();
      expect(state.targetTitle).toBeNull();
      expect(state.isTitleAnimating).toBe(false);
    });
  });
});
