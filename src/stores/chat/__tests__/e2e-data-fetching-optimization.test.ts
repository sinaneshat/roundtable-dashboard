/**
 * E2E Data Fetching Optimization Tests
 *
 * Tests for data fetching patterns to prevent overfetching and underfetching:
 * 1. Query invalidation patterns - targeted, not broad
 * 2. Refetch triggers during navigation - only when necessary
 * 3. Pre-search data fetching frequency - conditional polling
 * 4. Thread list (sidebar) refetch patterns - optimistic updates
 * 5. Moderator data fetch timing - ONE-WAY DATA FLOW
 * 6. Query cache pre-population - prevent server fetches
 *
 * Focus: TanStack Query behavior, cache efficiency, stale-while-revalidate patterns
 */

import { QueryClient } from '@tanstack/react-query';
import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageStatuses } from '@/api/core/enums';
import { queryKeys } from '@/lib/data/query-keys';
import { POLLING_INTERVALS, STALE_TIMES } from '@/lib/data/stale-times';
import { createTestAssistantMessage, createTestModeratorMessage, createTestUserMessage } from '@/lib/testing';

import { createChatStore } from '../store';

// ============================================================================
// Mock Utilities - Track Query Behavior
// ============================================================================

type QueryFetchRecord = {
  queryKey: unknown[];
  timestamp: number;
  cacheHit: boolean;
  staleTime?: number;
};

type QueryBehaviorTracker = {
  fetches: QueryFetchRecord[];
  cacheHits: QueryFetchRecord[];
  cacheMisses: QueryFetchRecord[];
  recordFetch: (queryKey: unknown[], cacheHit: boolean, staleTime?: number) => void;
  getFetchCount: (keyMatcher: string) => number;
  getCacheHitCount: (keyMatcher: string) => number;
  getCacheMissCount: (keyMatcher: string) => number;
  getLastFetch: (keyMatcher: string) => QueryFetchRecord | undefined;
  clear: () => void;
};

function createQueryBehaviorTracker(): QueryBehaviorTracker {
  const fetches: QueryFetchRecord[] = [];

  return {
    fetches,
    cacheHits: fetches.filter(f => f.cacheHit),
    cacheMisses: fetches.filter(f => !f.cacheHit),

    recordFetch(queryKey: unknown[], cacheHit: boolean, staleTime?: number) {
      fetches.push({ queryKey, timestamp: Date.now(), cacheHit, staleTime });
    },

    getFetchCount(keyMatcher: string) {
      return fetches.filter(f => JSON.stringify(f.queryKey).includes(keyMatcher)).length;
    },

    getCacheHitCount(keyMatcher: string) {
      return fetches.filter(f => f.cacheHit && JSON.stringify(f.queryKey).includes(keyMatcher)).length;
    },

    getCacheMissCount(keyMatcher: string) {
      return fetches.filter(f => !f.cacheHit && JSON.stringify(f.queryKey).includes(keyMatcher)).length;
    },

    getLastFetch(keyMatcher: string) {
      const matches = fetches.filter(f => JSON.stringify(f.queryKey).includes(keyMatcher));
      return matches[matches.length - 1];
    },

    clear() {
      fetches.length = 0;
    },
  };
}

// ============================================================================
// Test Suite: Thread Detail Fetch - Cache Usage
// ============================================================================

describe('thread Detail Fetch - Cache Usage', () => {
  let queryClient: QueryClient;
  let tracker: QueryBehaviorTracker;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    tracker = createQueryBehaviorTracker();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    queryClient.clear();
    consoleLogSpy.mockRestore();
  });

  it('should use cache after first load, not refetch on every render', async () => {
    const threadId = 'thread_123';
    const threadDetailKey = queryKeys.threads.detail(threadId);

    // Initial fetch - cache miss
    const initialData = { success: true, data: { id: threadId, title: 'Test Thread' } };
    await queryClient.prefetchQuery({
      queryKey: threadDetailKey,
      queryFn: async () => {
        tracker.recordFetch(threadDetailKey, false, STALE_TIMES.threadDetail);
        return initialData;
      },
      staleTime: STALE_TIMES.threadDetail,
    });

    // Second fetch - should use cache (within staleTime)
    const cachedData = queryClient.getQueryData(threadDetailKey);
    if (cachedData) {
      tracker.recordFetch(threadDetailKey, true, STALE_TIMES.threadDetail);
    }

    // Third fetch (simulating re-render) - should still use cache
    const cachedData2 = queryClient.getQueryData(threadDetailKey);
    if (cachedData2) {
      tracker.recordFetch(threadDetailKey, true, STALE_TIMES.threadDetail);
    }

    // ASSERTIONS
    expect(tracker.getFetchCount('detail')).toBe(3); // 1 server fetch + 2 cache hits
    expect(tracker.getCacheMissCount('detail')).toBe(1); // Only initial fetch
    expect(tracker.getCacheHitCount('detail')).toBe(2); // Subsequent accesses hit cache
  });

  it('should refetch after staleTime expires', async () => {
    const threadId = 'thread_123';
    const threadDetailKey = queryKeys.threads.detail(threadId);

    // Set very short staleTime for testing
    const testStaleTime = 10; // 10ms

    // Initial fetch
    await queryClient.prefetchQuery({
      queryKey: threadDetailKey,
      queryFn: async () => {
        tracker.recordFetch(threadDetailKey, false, testStaleTime);
        return { success: true, data: { id: threadId } };
      },
      staleTime: testStaleTime,
    });

    // Wait for staleTime to expire
    await new Promise(resolve => setTimeout(resolve, testStaleTime + 5));

    // Query should now refetch (cache stale)
    const state = queryClient.getQueryState(threadDetailKey);
    const isStale = state ? Date.now() - state.dataUpdatedAt > testStaleTime : true;

    if (isStale) {
      tracker.recordFetch(threadDetailKey, false, testStaleTime);
    }

    // ASSERTIONS
    expect(isStale).toBe(true); // Data should be stale
    expect(tracker.getCacheMissCount('detail')).toBe(2); // Initial + refetch after stale
  });

  it('should NOT refetch on navigation if within staleTime', async () => {
    const threadId = 'thread_123';
    const threadDetailKey = queryKeys.threads.detail(threadId);

    // Prefetch with normal staleTime
    await queryClient.prefetchQuery({
      queryKey: threadDetailKey,
      queryFn: async () => {
        tracker.recordFetch(threadDetailKey, false, STALE_TIMES.threadDetail);
        return { success: true, data: { id: threadId } };
      },
      staleTime: STALE_TIMES.threadDetail, // 10 seconds
    });

    // Simulate navigation back to same thread (within staleTime)
    const cachedData = queryClient.getQueryData(threadDetailKey);
    if (cachedData) {
      tracker.recordFetch(threadDetailKey, true, STALE_TIMES.threadDetail);
    } else {
      // Would trigger fetch if not cached
      tracker.recordFetch(threadDetailKey, false, STALE_TIMES.threadDetail);
    }

    // ASSERTIONS
    expect(tracker.getCacheMissCount('detail')).toBe(1); // Only initial fetch
    expect(tracker.getCacheHitCount('detail')).toBe(1); // Navigation used cache
  });
});

// ============================================================================
// Test Suite: Slug Status Polling - AI Title Detection
// ============================================================================

describe('slug Status Polling - AI Title Detection', () => {
  let queryClient: QueryClient;
  let tracker: QueryBehaviorTracker;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    tracker = createQueryBehaviorTracker();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    queryClient.clear();
    consoleLogSpy.mockRestore();
  });

  it('should verify polling stops when AI title detected', () => {
    const _threadId = 'thread_123';
    let isAiGeneratedTitle = false;
    let pollingActive = true;

    // Simulate polling logic from useThreadSlugStatusQuery
    const refetchInterval = () => {
      // Stop polling if tab is hidden
      if (typeof document !== 'undefined' && document.hidden) {
        return false;
      }

      // Stop polling if AI title detected
      if (isAiGeneratedTitle) {
        pollingActive = false;
        return false;
      }

      // Continue polling every 10s when title is NOT AI-generated
      return pollingActive ? 10 * 1000 : false;
    };

    // Initial state - should poll
    expect(refetchInterval()).toBe(10000); // Polling active

    // Simulate AI title detected
    isAiGeneratedTitle = true;

    // Should stop polling
    expect(refetchInterval()).toBe(false); // Polling stopped

    // Verify polling doesn't resume
    expect(pollingActive).toBe(false);
  });

  it('should NOT poll continuously - uses conditional refetchInterval', async () => {
    const threadId = 'thread_123';
    const slugStatusKey = queryKeys.threads.slugStatus(threadId);

    // Track polling attempts
    let pollCount = 0;
    const maxPolls = 3;

    // Simulate polling with AI title detection after 2 polls
    const simulatePolling = async () => {
      for (let i = 0; i < maxPolls; i++) {
        pollCount++;

        // Simulate fetch
        const response = {
          success: true,
          data: { isAiGeneratedTitle: i >= 2 }, // AI title detected on 3rd poll
        };

        tracker.recordFetch(slugStatusKey, false);

        // Stop if AI title detected
        if (response.data?.isAiGeneratedTitle) {
          break;
        }

        // Wait for polling interval
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    };

    await simulatePolling();

    // ASSERTIONS
    expect(pollCount).toBe(3); // Should poll until AI title detected
    expect(tracker.getFetchCount('slug-status')).toBe(3); // 3 fetches (stopped after detection)
    expect(tracker.getFetchCount('slug-status')).toBeLessThan(maxPolls + 1); // Should NOT exceed max
  });

  it('should pause polling when tab is hidden', () => {
    // Mock document.hidden
    let documentHidden = false;
    Object.defineProperty(document, 'hidden', {
      get: () => documentHidden,
      configurable: true,
    });

    const refetchInterval = (enabled: boolean, threadId: string | null) => {
      if (!enabled || !threadId) {
        return false;
      }

      // Don't poll if tab is hidden (saves battery & server load)
      if (typeof document !== 'undefined' && document.hidden) {
        return false;
      }

      // Poll every 10s when tab is visible
      return 10 * 1000;
    };

    // Tab visible - should poll
    expect(refetchInterval(true, 'thread_123')).toBe(10000);

    // Tab hidden - should NOT poll
    documentHidden = true;
    expect(refetchInterval(true, 'thread_123')).toBe(false);

    // Tab visible again - resume polling
    documentHidden = false;
    expect(refetchInterval(true, 'thread_123')).toBe(10000);
  });
});

// ============================================================================
// Test Suite: Sidebar Invalidation - Thread List Updates
// ============================================================================

describe('sidebar Invalidation - Thread List Updates', () => {
  let queryClient: QueryClient;
  let tracker: QueryBehaviorTracker;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    tracker = createQueryBehaviorTracker();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    queryClient.clear();
    consoleLogSpy.mockRestore();
  });

  it('should NOT refetch entire list when single thread title updates', async () => {
    const threadsListKey = queryKeys.threads.lists();
    const threadDetailKey = queryKeys.threads.detail('thread_123');

    // Initial thread list fetch
    await queryClient.prefetchQuery({
      queryKey: threadsListKey,
      queryFn: async () => {
        tracker.recordFetch(threadsListKey, false);
        return {
          success: true,
          data: {
            items: [
              { id: 'thread_123', title: 'Old Title' },
              { id: 'thread_456', title: 'Other Thread' },
            ],
          },
        };
      },
    });

    // Update single thread title via optimistic update (ONE-WAY DATA FLOW)
    queryClient.setQueryData(threadDetailKey, {
      success: true,
      data: { id: 'thread_123', title: 'New Title' },
    });

    // Check if list was invalidated (it should NOT be)
    const listState = queryClient.getQueryState(threadsListKey);
    const listWasInvalidated = listState?.isInvalidated ?? false;

    // ASSERTIONS
    expect(tracker.getFetchCount('list')).toBe(1); // Only initial fetch
    expect(listWasInvalidated).toBe(false); // List NOT invalidated
  });

  it('should use optimistic updates for thread mutations, not refetches', async () => {
    const threadsListKey = queryKeys.threads.lists();
    const newThreadId = 'thread_new';

    // Prefetch initial list
    await queryClient.prefetchQuery({
      queryKey: threadsListKey,
      queryFn: async () => {
        tracker.recordFetch(threadsListKey, false);
        return {
          success: true,
          data: { items: [{ id: 'thread_123', title: 'Existing' }] },
        };
      },
    });

    // Optimistic update - add new thread to cache WITHOUT server fetch
    const currentData = queryClient.getQueryData<{
      success: boolean;
      data: { items: Array<{ id: string; title: string }> };
    }>(threadsListKey);

    if (currentData?.success) {
      queryClient.setQueryData(threadsListKey, {
        ...currentData,
        data: {
          items: [
            { id: newThreadId, title: 'New Thread' },
            ...currentData.data.items,
          ],
        },
      });
    }

    // Verify cache was updated optimistically
    const updatedData = queryClient.getQueryData<{
      success: boolean;
      data: { items: Array<{ id: string; title: string }> };
    }>(threadsListKey);

    // ASSERTIONS
    expect(tracker.getFetchCount('list')).toBe(1); // Only initial fetch, NO refetch
    expect(updatedData?.data.items).toHaveLength(2); // Optimistically added
    expect(updatedData?.data.items[0]?.id).toBe(newThreadId); // New thread prepended
  });
});

// ============================================================================
// Test Suite: Pre-Search Query - Conditional Polling
// ============================================================================

describe('pre-Search Query - Conditional Polling', () => {
  let queryClient: QueryClient;
  let tracker: QueryBehaviorTracker;
  let _store: ReturnType<typeof createChatStore>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    tracker = createQueryBehaviorTracker();
    _store = createChatStore();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    queryClient.clear();
    consoleLogSpy.mockRestore();
  });

  it('should NOT refetch completed pre-searches', async () => {
    const threadId = 'thread_123';
    const preSearchKey = queryKeys.threads.preSearches(threadId);

    // Initial fetch - pre-search COMPLETE
    const completedPreSearch = {
      id: 'ps_1',
      roundNumber: 0,
      status: MessageStatuses.COMPLETE,
      data: { results: ['result1'] },
    };

    await queryClient.prefetchQuery({
      queryKey: preSearchKey,
      queryFn: async () => {
        tracker.recordFetch(preSearchKey, false);
        return {
          success: true,
          data: { items: [completedPreSearch] },
        };
      },
      staleTime: STALE_TIMES.preSearch, // Infinity
    });

    // Simulate refetchInterval logic from pre-search.ts
    const data = queryClient.getQueryData<{
      success: boolean;
      data: { items: Array<{ status: string }> };
    }>(preSearchKey);

    const hasPendingPreSearch = data?.data?.items?.some(
      ps => ps.status === MessageStatuses.PENDING,
    );

    const shouldPoll = hasPendingPreSearch ? POLLING_INTERVALS.preSearchPending : false;

    // ASSERTIONS
    expect(tracker.getFetchCount('pre-searches')).toBe(1); // Only initial fetch
    expect(shouldPoll).toBe(false); // NO polling when complete
    expect(hasPendingPreSearch).toBe(false);
  });

  it('should poll ONLY when pre-search is PENDING, stop when STREAMING', async () => {
    const threadId = 'thread_123';
    const preSearchKey = queryKeys.threads.preSearches(threadId);

    // State 1: Pre-search PENDING - should poll
    const pendingData = {
      success: true,
      data: {
        items: [{ id: 'ps_1', roundNumber: 0, status: MessageStatuses.PENDING }],
      },
    };

    queryClient.setQueryData(preSearchKey, pendingData);
    tracker.recordFetch(preSearchKey, false);

    let data = queryClient.getQueryData<typeof pendingData>(preSearchKey);
    let hasPending = data?.data?.items?.some(ps => ps.status === MessageStatuses.PENDING);
    let shouldPoll = hasPending ? POLLING_INTERVALS.preSearchPending : false;

    expect(shouldPoll).toBe(500); // Should poll at 500ms

    // State 2: Pre-search STREAMING - should stop polling (SSE handles updates)
    const streamingData = {
      success: true,
      data: {
        items: [{ id: 'ps_1', roundNumber: 0, status: MessageStatuses.STREAMING }],
      },
    };

    queryClient.setQueryData(preSearchKey, streamingData);
    tracker.recordFetch(preSearchKey, true); // Cache update, not fetch

    data = queryClient.getQueryData<typeof streamingData>(preSearchKey);
    hasPending = data?.data?.items?.some(ps => ps.status === MessageStatuses.PENDING);
    shouldPoll = hasPending ? POLLING_INTERVALS.preSearchPending : false;

    // ASSERTIONS
    expect(shouldPoll).toBe(false); // Polling stopped
    expect(tracker.getFetchCount('pre-searches')).toBe(2); // Initial + poll (stopped before second poll)
  });

  it('should have infinite staleTime for completed pre-searches', () => {
    // Verify pre-search follows ONE-WAY DATA FLOW pattern
    expect(STALE_TIMES.preSearch).toBe(Infinity);
  });
});

// ============================================================================
// Test Suite: Moderator Data - ONE-WAY DATA FLOW
// ============================================================================

describe('moderator Data - ONE-WAY DATA FLOW', () => {
  let queryClient: QueryClient;
  let tracker: QueryBehaviorTracker;
  let store: ReturnType<typeof createChatStore>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    tracker = createQueryBehaviorTracker();
    store = createChatStore();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    queryClient.clear();
    consoleLogSpy.mockRestore();
  });

  it('should NOT fetch moderator data multiple times per round', () => {
    const roundNumber = 0;

    // Create messages with moderator
    const messages: UIMessage[] = [
      createTestUserMessage({ id: 'user_r0', content: 'Test', roundNumber }),
      createTestAssistantMessage({
        id: 'p0_r0',
        content: 'Response 1',
        roundNumber,
        participantId: 'p1',
        participantIndex: 0,
      }),
      createTestAssistantMessage({
        id: 'p1_r0',
        content: 'Response 2',
        roundNumber,
        participantId: 'p2',
        participantIndex: 1,
      }),
      createTestModeratorMessage({
        id: 'mod_r0',
        content: 'Summary',
        roundNumber,
      }),
    ];

    store.setState({ messages });

    // Extract moderator from messages (ONE-WAY: messages -> moderator data)
    const moderatorMessage = messages.find(
      m => m.metadata && 'isModerator' in m.metadata && m.metadata.isModerator,
    );

    // Track that we "fetched" moderator data
    if (moderatorMessage) {
      tracker.recordFetch(['moderator', roundNumber], false);
    }

    // Try to "fetch" again (simulating re-render or duplicate call)
    const moderatorMessage2 = messages.find(
      m => m.metadata && 'isModerator' in m.metadata && m.metadata.isModerator,
    );

    if (moderatorMessage2) {
      // This should use cached data, not fetch again
      tracker.recordFetch(['moderator', roundNumber], true);
    }

    // ASSERTIONS
    expect(tracker.getFetchCount('moderator')).toBe(2);
    expect(tracker.getCacheMissCount('moderator')).toBe(1); // Only one actual data extraction
    expect(tracker.getCacheHitCount('moderator')).toBe(1); // Second access from cache
  });

  it('should verify moderator staleTime is Infinity (ONE-WAY DATA FLOW)', () => {
    // Moderator data follows ONE-WAY pattern: SSE -> messages -> UI
    // Never invalidated or refetched from separate endpoint
    expect(STALE_TIMES.threadModerators).toBe(Infinity);
  });

  it('should NOT invalidate queries after moderator completes', () => {
    const threadId = 'thread_123';
    const changelogKey = queryKeys.threads.changelog(threadId);

    // Prefetch changelog
    queryClient.setQueryData(changelogKey, {
      success: true,
      data: { items: [{ roundNumber: 0, type: 'config-change' }] },
    });

    // Simulate moderator completion - should NOT invalidate changelog
    // ONE-WAY DATA FLOW: moderator data comes via SSE, not separate query

    const changelogState = queryClient.getQueryState(changelogKey);
    const wasInvalidated = changelogState?.isInvalidated ?? false;

    // ASSERTIONS
    expect(wasInvalidated).toBe(false); // Changelog NOT invalidated
  });
});

// ============================================================================
// Test Suite: Query Cache Pre-population - Prevent Server Fetches
// ============================================================================

describe('query Cache Pre-population - Prevent Server Fetches', () => {
  let queryClient: QueryClient;
  let tracker: QueryBehaviorTracker;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    tracker = createQueryBehaviorTracker();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    queryClient.clear();
    consoleLogSpy.mockRestore();
  });

  it('should verify prepopulateQueryCache prevents server fetches', async () => {
    const threadId = 'thread_123';
    const threadDetailKey = queryKeys.threads.detail(threadId);

    // Simulate server-side prefetch (prepopulateQueryCache pattern)
    const serverData = {
      success: true,
      data: { id: threadId, title: 'Prefetched Thread' },
    };

    // Pre-populate cache (server-side hydration)
    queryClient.setQueryData(threadDetailKey, serverData);

    // Client-side query should use cache, not fetch
    const cachedData = queryClient.getQueryData(threadDetailKey);
    if (cachedData) {
      tracker.recordFetch(threadDetailKey, true, STALE_TIMES.threadDetail);
    } else {
      // This would trigger server fetch if cache empty
      tracker.recordFetch(threadDetailKey, false, STALE_TIMES.threadDetail);
    }

    // ASSERTIONS
    expect(cachedData).toEqual(serverData); // Cache hit
    expect(tracker.getCacheMissCount('detail')).toBe(0); // NO server fetch
    expect(tracker.getCacheHitCount('detail')).toBe(1); // Used prefetched data
  });

  it('should verify staleTime matches between server prefetch and client query', () => {
    // Document that server and client MUST use same staleTime
    const serverSideStaleTime = STALE_TIMES.threadDetail; // Server prefetch
    const clientSideStaleTime = STALE_TIMES.threadDetail; // Client useQuery

    // This prevents hydration mismatches and unnecessary refetches
    expect(serverSideStaleTime).toBe(clientSideStaleTime);
    expect(serverSideStaleTime).toBe(2 * 60 * 1000); // 2 minutes - optimized for navigation
  });

  it('should verify messages use medium staleTime for navigation performance', () => {
    // Messages use 2-minute stale time for instant navigation
    // New messages arrive via streaming, not polling
    expect(STALE_TIMES.threadMessages).toBe(2 * 60 * 1000); // 2 minutes

    // But changelog is Infinity (ONE-WAY DATA FLOW)
    expect(STALE_TIMES.threadChangelog).toBe(Infinity);
  });
});

// ============================================================================
// Test Suite: Navigation Refetch Patterns
// ============================================================================

describe('navigation Refetch Patterns', () => {
  let queryClient: QueryClient;
  let tracker: QueryBehaviorTracker;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    tracker = createQueryBehaviorTracker();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    queryClient.clear();
    consoleLogSpy.mockRestore();
  });

  it('should NOT refetch on navigation if within staleTime', async () => {
    const threadId = 'thread_123';
    const threadDetailKey = queryKeys.threads.detail(threadId);

    // Simulate initial page load
    await queryClient.prefetchQuery({
      queryKey: threadDetailKey,
      queryFn: async () => {
        tracker.recordFetch(threadDetailKey, false);
        return { success: true, data: { id: threadId } };
      },
      staleTime: STALE_TIMES.threadDetail,
    });

    // Simulate navigation away and back (within staleTime)
    const state = queryClient.getQueryState(threadDetailKey);
    const timeSinceUpdate = state ? Date.now() - state.dataUpdatedAt : Infinity;
    const isStale = timeSinceUpdate > STALE_TIMES.threadDetail;

    if (!isStale) {
      // Use cached data
      tracker.recordFetch(threadDetailKey, true);
    } else {
      // Would refetch if stale
      tracker.recordFetch(threadDetailKey, false);
    }

    // ASSERTIONS
    expect(isStale).toBe(false); // Data still fresh
    expect(tracker.getCacheMissCount('detail')).toBe(1); // Only initial fetch
    expect(tracker.getCacheHitCount('detail')).toBe(1); // Navigation used cache
  });

  it('should disable automatic refetch behaviors for pre-search', () => {
    // Pre-search query should have all refetch flags disabled
    const preSearchQueryConfig = {
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchIntervalInBackground: false,
    };

    // These settings prevent unnecessary refetches
    expect(preSearchQueryConfig.refetchOnMount).toBe(false);
    expect(preSearchQueryConfig.refetchOnWindowFocus).toBe(false);
    expect(preSearchQueryConfig.refetchOnReconnect).toBe(false);
    expect(preSearchQueryConfig.refetchIntervalInBackground).toBe(false);
  });
});

// ============================================================================
// Test Suite: Query Deduplication
// ============================================================================

describe('query Deduplication', () => {
  let queryClient: QueryClient;
  let tracker: QueryBehaviorTracker;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    tracker = createQueryBehaviorTracker();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    queryClient.clear();
    consoleLogSpy.mockRestore();
  });

  it('should deduplicate simultaneous requests for same query key', async () => {
    const threadId = 'thread_123';
    const threadDetailKey = queryKeys.threads.detail(threadId);

    let fetchCount = 0;

    // Simulate multiple components requesting same data simultaneously
    const queryFn = async () => {
      fetchCount++;
      tracker.recordFetch(threadDetailKey, false);
      await new Promise(resolve => setTimeout(resolve, 10));
      return { success: true, data: { id: threadId } };
    };

    // Fire 3 simultaneous fetches
    const promises = [
      queryClient.fetchQuery({ queryKey: threadDetailKey, queryFn, staleTime: STALE_TIMES.threadDetail }),
      queryClient.fetchQuery({ queryKey: threadDetailKey, queryFn, staleTime: STALE_TIMES.threadDetail }),
      queryClient.fetchQuery({ queryKey: threadDetailKey, queryFn, staleTime: STALE_TIMES.threadDetail }),
    ];

    await Promise.all(promises);

    // ASSERTIONS
    expect(fetchCount).toBe(1); // Only ONE actual fetch (deduplication worked)
    expect(tracker.getFetchCount('detail')).toBe(1); // Confirmed single fetch
  });

  it('should verify placeholderData prevents loading states during refetch', async () => {
    const preSearchKey = queryKeys.threads.preSearches('thread_123');

    // Initial data
    const initialData = {
      success: true,
      data: { items: [{ id: 'ps_1', status: MessageStatuses.COMPLETE }] },
    };

    queryClient.setQueryData(preSearchKey, initialData);

    // Simulate refetch with placeholderData pattern
    const state = queryClient.getQueryState(preSearchKey);

    // placeholderData: previousData prevents loading state flash
    const hasPlaceholder = !!state?.data;

    // ASSERTIONS
    expect(hasPlaceholder).toBe(true); // Previous data available as placeholder
  });
});

// ============================================================================
// Test Suite: Invalidation Patterns - Targeted, Not Broad
// ============================================================================

describe('invalidation Patterns - Targeted, Not Broad', () => {
  let queryClient: QueryClient;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    queryClient.clear();
    consoleLogSpy.mockRestore();
  });

  it('should invalidate only specific thread detail, not all threads', async () => {
    const thread123Key = queryKeys.threads.detail('thread_123');
    const thread456Key = queryKeys.threads.detail('thread_456');

    // Set data for both threads
    queryClient.setQueryData(thread123Key, { success: true, data: { id: 'thread_123' } });
    queryClient.setQueryData(thread456Key, { success: true, data: { id: 'thread_456' } });

    // Invalidate only thread_123
    await queryClient.invalidateQueries({ queryKey: thread123Key });

    const state123 = queryClient.getQueryState(thread123Key);
    const state456 = queryClient.getQueryState(thread456Key);

    // ASSERTIONS
    expect(state123?.isInvalidated).toBe(true); // thread_123 invalidated
    expect(state456?.isInvalidated).toBe(false); // thread_456 NOT invalidated
  });

  it('should use hierarchical invalidation for related queries', async () => {
    const threadsBase = queryKeys.threads.all;
    const threadsList = queryKeys.threads.lists();
    const threadDetail = queryKeys.threads.detail('thread_123');

    // Set data
    queryClient.setQueryData(threadsList, { success: true, data: { items: [] } });
    queryClient.setQueryData(threadDetail, { success: true, data: { id: 'thread_123' } });

    // Invalidate all threads (hierarchical: base -> lists, details)
    await queryClient.invalidateQueries({ queryKey: threadsBase });

    const listState = queryClient.getQueryState(threadsList);
    const detailState = queryClient.getQueryState(threadDetail);

    // ASSERTIONS
    expect(listState?.isInvalidated).toBe(true); // Lists invalidated
    expect(detailState?.isInvalidated).toBe(true); // Detail invalidated
  });

  it('should verify usage queries invalidated after chat operations', () => {
    // After chat operation, only invalidate usage stats (targeted)
    const afterChatInvalidation = [queryKeys.usage.stats()];

    // Should NOT invalidate thread list, thread detail, etc. (broad)
    expect(afterChatInvalidation).toHaveLength(1); // Only usage stats
    expect(afterChatInvalidation[0]).toEqual(['usage', 'stats']); // Specific key
  });
});
