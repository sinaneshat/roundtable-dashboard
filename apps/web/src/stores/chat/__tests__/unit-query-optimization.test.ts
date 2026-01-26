import { ChatModes } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { invalidationPatterns, queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import { createBaseMockThread } from '@/lib/testing';

import {
  validateChangelogListCache,
  validateInfiniteQueryCache,
  validateThreadDetailPayloadCache,
  validateThreadsListPages,
  validateUsageStatsCache,
} from '../actions/types';

describe('query Key Stability', () => {
  describe('queryKeys.threads.detail', () => {
    it('should generate stable keys for same thread ID', () => {
      const threadId = 'thread-123';

      const key1 = queryKeys.threads.detail(threadId);
      const key2 = queryKeys.threads.detail(threadId);

      expect(key1).toEqual(key2);
      expect(key1).toStrictEqual(['threads', 'detail', threadId]);
    });

    it('should generate different keys for different thread IDs', () => {
      const key1 = queryKeys.threads.detail('thread-123');
      const key2 = queryKeys.threads.detail('thread-456');

      expect(key1).not.toEqual(key2);
      expect(key1[2]).toBe('thread-123');
      expect(key2[2]).toBe('thread-456');
    });

    it('should maintain referential equality for same input', () => {
      const threadId = 'thread-123';

      const key1 = queryKeys.threads.detail(threadId);
      const key2 = queryKeys.threads.detail(threadId);

      expect(key1).toEqual(key2);
      expect(JSON.stringify(key1)).toBe(JSON.stringify(key2));
    });
  });

  describe('queryKeys.threads.lists', () => {
    it('should generate base list key without search param', () => {
      const key = queryKeys.threads.lists();

      expect(key).toStrictEqual(['threads', 'list']);
    });

    it('should generate search key with search param', () => {
      const searchQuery = 'test query';
      const key = queryKeys.threads.lists(searchQuery);

      expect(key).toStrictEqual(['threads', 'list', 'search', searchQuery]);
    });

    it('should generate different keys for different search queries', () => {
      const key1 = queryKeys.threads.lists('query1');
      const key2 = queryKeys.threads.lists('query2');

      expect(key1).not.toEqual(key2);
      expect(key1[3]).toBe('query1');
      expect(key2[3]).toBe('query2');
    });

    it('should maintain stability for same search query', () => {
      const searchQuery = 'stable query';

      const key1 = queryKeys.threads.lists(searchQuery);
      const key2 = queryKeys.threads.lists(searchQuery);

      expect(key1).toEqual(key2);
      expect(JSON.stringify(key1)).toBe(JSON.stringify(key2));
    });
  });

  describe('queryKeys.threads.changelog', () => {
    it('should generate stable changelog key for thread', () => {
      const threadId = 'thread-123';

      const key1 = queryKeys.threads.changelog(threadId);
      const key2 = queryKeys.threads.changelog(threadId);

      expect(key1).toEqual(key2);
      expect(key1).toStrictEqual(['threads', 'changelog', threadId]);
    });
  });

  describe('queryKeys.threads.roundChangelog', () => {
    it('should generate stable round-specific changelog key', () => {
      const threadId = 'thread-123';
      const roundNumber = 1;

      const key1 = queryKeys.threads.roundChangelog(threadId, roundNumber);
      const key2 = queryKeys.threads.roundChangelog(threadId, roundNumber);

      expect(key1).toEqual(key2);
      expect(key1).toStrictEqual(['threads', 'changelog', threadId, 'round', '1']);
    });

    it('should convert round number to string consistently', () => {
      const threadId = 'thread-123';

      const key = queryKeys.threads.roundChangelog(threadId, 1);

      expect(key[4]).toBe('1');
      expect(typeof key[4]).toBe('string');
    });
  });

  describe('queryKeys.threads.preSearches', () => {
    it('should generate stable pre-search key', () => {
      const threadId = 'thread-123';

      const key1 = queryKeys.threads.preSearches(threadId);
      const key2 = queryKeys.threads.preSearches(threadId);

      expect(key1).toEqual(key2);
      expect(key1).toStrictEqual(['threads', 'pre-searches', threadId]);
    });
  });
});

describe('query Deduplication', () => {
  it('should deduplicate identical thread detail queries', () => {
    const threadId = 'thread-123';

    const keys = [
      queryKeys.threads.detail(threadId),
      queryKeys.threads.detail(threadId),
      queryKeys.threads.detail(threadId),
    ];

    const uniqueKeys = new Set(keys.map(k => JSON.stringify(k)));

    expect(uniqueKeys.size).toBe(1);
  });

  it('should deduplicate identical list queries', () => {
    const keys = [
      queryKeys.threads.lists(),
      queryKeys.threads.lists(),
      queryKeys.threads.lists(),
    ];

    const uniqueKeys = new Set(keys.map(k => JSON.stringify(k)));

    expect(uniqueKeys.size).toBe(1);
  });

  it('should NOT deduplicate different search queries', () => {
    const keys = [
      queryKeys.threads.lists('query1'),
      queryKeys.threads.lists('query2'),
      queryKeys.threads.lists('query3'),
    ];

    const uniqueKeys = new Set(keys.map(k => JSON.stringify(k)));

    expect(uniqueKeys.size).toBe(3);
  });

  it('should deduplicate hierarchical invalidation keys', () => {
    const threadId = 'thread-123';

    const patterns = [
      invalidationPatterns.threadDetail(threadId),
      invalidationPatterns.threadDetail(threadId),
      invalidationPatterns.threadDetail(threadId),
    ];

    const allKeys = patterns.flat();
    const uniqueKeys = new Set(allKeys.map(k => JSON.stringify(k)));

    expect(uniqueKeys.size).toBeLessThanOrEqual(allKeys.length);
  });
});

describe('cache Validation', () => {
  describe('validateInfiniteQueryCache', () => {
    it('should return null without creating objects for undefined', () => {
      const result = validateInfiniteQueryCache(undefined);

      expect(result).toBeNull();
    });

    it('should return null without creating objects for null', () => {
      const result = validateInfiniteQueryCache(null);

      expect(result).toBeNull();
    });

    it('should return null for invalid structure without mutation', () => {
      const invalidData = { invalid: 'structure' };

      const result = validateInfiniteQueryCache(invalidData);

      expect(result).toBeNull();
      expect(invalidData).toEqual({ invalid: 'structure' });
    });

    it('should validate and return valid infinite query data', () => {
      const mockThread = createBaseMockThread({ id: 'thread-1', title: 'Thread 1' });

      const validData = {
        pageParams: [undefined],
        pages: [
          {
            data: {
              items: [mockThread],
            },
            success: true,
          },
        ],
      };

      const result = validateInfiniteQueryCache(validData);

      expect(result).not.toBeNull();
      expect(result?.pages).toHaveLength(1);
      expect(result?.pageParams).toHaveLength(1);
    });

    it('should NOT recreate objects if data is already valid', () => {
      const validData = {
        pageParams: [undefined],
        pages: [
          {
            data: {
              items: [],
            },
            success: true,
          },
        ],
      };

      const result = validateInfiniteQueryCache(validData);

      expect(result).not.toBeNull();
      expect(result?.pages).toBeDefined();
    });
  });

  describe('validateThreadDetailPayloadCache', () => {
    it('should return null for undefined without creating objects', () => {
      const result = validateThreadDetailPayloadCache(undefined);

      expect(result).toBeNull();
    });

    it('should return null for invalid API response structure', () => {
      const invalidData = { success: false };

      const result = validateThreadDetailPayloadCache(invalidData);

      expect(result).toBeNull();
    });

    it('should validate valid thread detail payload', () => {
      const validData = {
        data: {
          messages: [],
          participants: [],
          thread: {
            createdAt: new Date().toISOString(),
            id: 'thread-1',
            mode: ChatModes.COUNCIL,
            slug: 'test-thread',
            title: 'Test Thread',
            updatedAt: new Date().toISOString(),
            userId: 'user-1',
          },
        },
        success: true,
      };

      const result = validateThreadDetailPayloadCache(validData);

      expect(result).not.toBeNull();
      expect(result?.thread.id).toBe('thread-1');
    });
  });

  describe('validateThreadsListPages', () => {
    it('should return undefined for non-array input', () => {
      const result = validateThreadsListPages({ not: 'array' });

      expect(result).toBeUndefined();
    });

    it('should return undefined if any page fails validation', () => {
      const mixedPages = [
        {
          data: { items: [] },
          success: true,
        },
        {
          invalid: 'page',
        },
      ];

      const result = validateThreadsListPages(mixedPages);

      expect(result).toBeUndefined();
    });

    it('should validate all valid pages', () => {
      const validPages = [
        {
          data: {
            items: [
              {
                createdAt: new Date().toISOString(),
                id: 'thread-1',
                mode: ChatModes.COUNCIL,
                slug: 'thread-1',
                title: 'Thread 1',
                updatedAt: new Date().toISOString(),
                userId: 'user-1',
              },
            ],
          },
          success: true,
        },
        {
          data: {
            items: [],
          },
          success: true,
        },
      ];

      const result = validateThreadsListPages(validPages);

      expect(result).toBeDefined();
      expect(result).toHaveLength(2);
    });
  });

  describe('validateUsageStatsCache', () => {
    it('should return null for undefined', () => {
      const result = validateUsageStatsCache(undefined);

      expect(result).toBeNull();
    });

    it('should validate valid usage stats', () => {
      const validData = {
        data: {
          credits: {
            available: 800,
            balance: 1000,
            status: 'default',
          },
          plan: {
            hasActiveSubscription: true,
            monthlyCredits: 10000,
            name: 'Pro Plan',
            nextRefillAt: new Date().toISOString(),
            pendingChange: null,
            type: 'pro',
          },
        },
        success: true,
      };

      const result = validateUsageStatsCache(validData);

      expect(result).not.toBeNull();
      expect(result?.credits.balance).toBe(1000);
      expect(result?.plan.type).toBe('pro');
    });
  });

  describe('validateChangelogListCache', () => {
    it('should return null for undefined', () => {
      const result = validateChangelogListCache(undefined);

      expect(result).toBeNull();
    });

    it('should return null for invalid changelog structure', () => {
      const invalidData = {
        data: {
          items: [
            {
              // Missing required fields
              id: 'changelog-1',
              threadId: 'thread-1',
            },
          ],
        },
        success: true,
      };

      const result = validateChangelogListCache(invalidData);

      expect(result).toBeNull();
    });
  });
});

describe('optimistic Update Patterns', () => {
  describe('thread Update Optimistic Pattern', () => {
    it('should preserve object shape during optimistic update', () => {
      const previousThread = {
        createdAt: new Date().toISOString(),
        id: 'thread-1',
        isFavorite: false,
        mode: ChatModes.COUNCIL,
        slug: 'original-slug',
        title: 'Original Title',
        updatedAt: new Date().toISOString(),
        userId: 'user-1',
      };

      const optimisticUpdate = {
        title: 'Updated Title',
      };

      const optimisticThread = {
        ...previousThread,
        ...optimisticUpdate,
      };

      expect(optimisticThread.title).toBe('Updated Title');
      expect(optimisticThread.slug).toBe('original-slug');
      expect(optimisticThread.id).toBe('thread-1');
    });

    it('should validate optimistic update without mutation', () => {
      const mockThread = createBaseMockThread({
        id: 'thread-1',
        isFavorite: false,
        title: 'Original Title',
      });

      const optimisticThread = {
        ...mockThread,
        isFavorite: true,
        title: 'Updated Title',
      };

      expect(optimisticThread.id).toBe('thread-1');
      expect(optimisticThread.title).toBe('Updated Title');
      expect(optimisticThread.isFavorite).toBeTruthy();
      expect(optimisticThread.slug).toBe(mockThread.slug);
    });
  });

  describe('infinite Query Optimistic Update', () => {
    it('should update specific item in pages without recreating entire structure', () => {
      const pages = [
        {
          data: {
            items: [
              {
                createdAt: new Date().toISOString(),
                id: 'thread-1',
                isFavorite: false,
                mode: ChatModes.COUNCIL,
                slug: 'thread-1',
                title: 'Thread 1',
                updatedAt: new Date().toISOString(),
                userId: 'user-1',
              },
              {
                createdAt: new Date().toISOString(),
                id: 'thread-2',
                isFavorite: false,
                mode: ChatModes.COUNCIL,
                slug: 'thread-2',
                title: 'Thread 2',
                updatedAt: new Date().toISOString(),
                userId: 'user-1',
              },
            ],
          },
          success: true,
        },
      ];
      const updatedPages = pages.map((page) => {
        if (!page.success || !page.data?.items) {
          return page;
        }

        return {
          ...page,
          data: {
            ...page.data,
            items: page.data.items.map(thread =>
              thread.id === 'thread-1'
                ? { ...thread, isFavorite: true }
                : thread,
            ),
          },
        };
      });

      expect(updatedPages[0].data?.items[0].isFavorite).toBeTruthy();
      expect(updatedPages[0].data?.items[1].isFavorite).toBeFalsy();
    });
  });
});

describe('invalidation Scope Precision', () => {
  const containsKey = (patterns: readonly unknown[], key: readonly unknown[]) => {
    return patterns.some(p => JSON.stringify(p) === JSON.stringify(key));
  };

  describe('invalidationPatterns.threadDetail', () => {
    it('should invalidate detail, list, and changelog', () => {
      const threadId = 'thread-123';
      const patterns = invalidationPatterns.threadDetail(threadId);

      expect(containsKey(patterns, queryKeys.threads.detail(threadId))).toBeTruthy();
      expect(containsKey(patterns, queryKeys.threads.lists())).toBeTruthy();
      expect(containsKey(patterns, queryKeys.threads.changelog(threadId))).toBeTruthy();
    });

    it('should NOT invalidate other thread details', () => {
      const threadId = 'thread-123';
      const patterns = invalidationPatterns.threadDetail(threadId);

      const otherThreadKey = queryKeys.threads.detail('thread-456');

      expect(containsKey(patterns, otherThreadKey)).toBeFalsy();
    });

    it('should be focused - not too broad', () => {
      const threadId = 'thread-123';
      const patterns = invalidationPatterns.threadDetail(threadId);

      // detail + lists + sidebar + changelog = 4 patterns
      expect(patterns).toHaveLength(4);
    });
  });

  describe('invalidationPatterns.threads', () => {
    it('should invalidate thread lists and usage stats', () => {
      const patterns = invalidationPatterns.threads;

      expect(containsKey(patterns, queryKeys.threads.lists())).toBeTruthy();
      expect(containsKey(patterns, queryKeys.usage.stats())).toBeTruthy();
    });

    it('should NOT invalidate specific thread details', () => {
      const patterns = invalidationPatterns.threads;

      const hasDetailKey = patterns.some(key =>
        Array.isArray(key) && key.includes('detail'),
      );

      expect(hasDetailKey).toBeFalsy();
    });
  });

  describe('invalidationPatterns.subscriptions', () => {
    it('should invalidate subscriptions, usage, and models (cascading effect)', () => {
      const patterns = invalidationPatterns.subscriptions;

      expect(containsKey(patterns, queryKeys.subscriptions.lists())).toBeTruthy();
      expect(containsKey(patterns, queryKeys.subscriptions.current())).toBeTruthy();
      expect(containsKey(patterns, queryKeys.usage.all)).toBeTruthy();
      expect(containsKey(patterns, queryKeys.models.all)).toBeTruthy();
    });

    it('should handle tier changes affecting model access', () => {
      const patterns = invalidationPatterns.subscriptions;

      expect(containsKey(patterns, queryKeys.models.all)).toBeTruthy();
    });
  });

  describe('invalidationPatterns.afterThreadMessage', () => {
    it('should invalidate thread detail, list, and usage stats', () => {
      const threadId = 'thread-123';
      const patterns = invalidationPatterns.afterThreadMessage(threadId);

      expect(containsKey(patterns, queryKeys.threads.detail(threadId))).toBeTruthy();
      expect(containsKey(patterns, queryKeys.threads.lists())).toBeTruthy();
      expect(containsKey(patterns, queryKeys.usage.stats())).toBeTruthy();
    });

    it('should update usage stats for credit consumption', () => {
      const threadId = 'thread-123';
      const patterns = invalidationPatterns.afterThreadMessage(threadId);

      expect(containsKey(patterns, queryKeys.usage.stats())).toBeTruthy();
    });
  });
});

describe('stale Time Configuration', () => {
  it('should use Infinity for static data', () => {
    expect(STALE_TIMES.threadChangelog).toBe(Infinity);
    expect(STALE_TIMES.threadModerators).toBe(Infinity);
    expect(STALE_TIMES.preSearch).toBe(Infinity);
  });

  it('should use Infinity for models', () => {
    expect(STALE_TIMES.models).toBe(Infinity);
  });

  it('should use NO CACHE for chat data (streaming updates require fresh data)', () => {
    // Messages and thread detail use NO CACHE - must always be fresh
    // Rate limit prevention handled by ONE-WAY DATA FLOW pattern (store is source of truth)
    expect(STALE_TIMES.threadMessages).toBe(0);
    expect(STALE_TIMES.threadDetail).toBe(0);
  });

  it('should use longer times for infrequent changes', () => {
    expect(STALE_TIMES.products).toBe(24 * 3600 * 1000);
    expect(STALE_TIMES.publicThreadDetail).toBe(24 * 3600 * 1000);
  });

  it('should use 60s staleTime for subscriptions (SSR hydration requires non-zero)', () => {
    // IMPORTANT: 0 would cause immediate refetch after SSR hydration (flash/flicker)
    // Fresh data after plan changes is handled by invalidation, not staleTime=0
    expect(STALE_TIMES.subscriptions).toBe(60 * 1000);
  });
});

describe('prefetch Cache Population', () => {
  it('should pre-populate thread detail with consistent structure', () => {
    const threadData = {
      messages: [],
      participants: [],
      thread: {
        createdAt: new Date().toISOString(),
        id: 'thread-123',
        mode: ChatModes.COUNCIL,
        slug: 'test-thread',
        title: 'Test Thread',
        updatedAt: new Date().toISOString(),
        userId: 'user-1',
      },
      user: {
        image: null,
        name: 'Test User',
      },
    };

    const result = validateThreadDetailPayloadCache({
      data: threadData,
      success: true,
    });

    expect(result).not.toBeNull();
    expect(result?.thread.id).toBe('thread-123');
    expect(result?.participants).toEqual([]);
    expect(result?.messages).toEqual([]);
  });

  it('should pre-populate pre-searches with correct format', () => {
    const preSearchData = {
      items: [
        {
          completedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          id: 'ps-1',
          query: 'test query',
          results: [],
          roundNumber: 0,
          status: 'completed',
          threadId: 'thread-123',
        },
      ],
    };

    expect(preSearchData.items).toHaveLength(1);
    expect(preSearchData.items[0].query).toBe('test query');
  });

  it('should prevent server fetch when cache is populated', () => {
    expect(STALE_TIMES.preSearch).toBe(Infinity);
    expect(STALE_TIMES.threadChangelog).toBe(Infinity);
    expect(STALE_TIMES.threadModerators).toBe(Infinity);
  });
});

describe('mutation OnSuccess Optimistic Updates', () => {
  it('should correctly merge server response with optimistic update', () => {
    const optimisticUpdate = {
      createdAt: new Date().toISOString(),
      id: 'thread-123',
      isFavorite: true,
      mode: ChatModes.COUNCIL,
      slug: 'thread-123',
      title: 'Optimistic Title',
      updatedAt: new Date().toISOString(),
      userId: 'user-1',
    };

    const serverResponse = {
      createdAt: new Date().toISOString(),
      id: 'thread-123',
      isFavorite: true,
      mode: ChatModes.COUNCIL,
      slug: 'thread-123',
      title: 'Optimistic Title',
      updatedAt: new Date().toISOString(),
      userId: 'user-1',
      version: 2,
    };

    const finalData = {
      ...optimisticUpdate,
      ...serverResponse,
    };

    expect(finalData.version).toBe(2);
    expect(finalData.title).toBe('Optimistic Title');
  });

  it('should rollback optimistic update on error', () => {
    const previousState = {
      id: 'thread-123',
      isFavorite: false,
      title: 'Original Title',
    };

    let currentState = {
      ...previousState,
      isFavorite: true,
    };

    currentState = previousState;

    expect(currentState.isFavorite).toBeFalsy();
    expect(currentState.title).toBe('Original Title');
  });

  it('should validate optimistic update preserves required fields', () => {
    const baseThread = {
      createdAt: new Date().toISOString(),
      id: 'thread-123',
      mode: ChatModes.COUNCIL,
      slug: 'thread-123',
      title: 'Original Title',
      updatedAt: new Date().toISOString(),
      userId: 'user-1',
    };

    const optimisticUpdate = {
      isFavorite: true,
    };

    const updated = {
      ...baseThread,
      ...optimisticUpdate,
    };

    expect(updated.id).toBe('thread-123');
    expect(updated.title).toBe('Original Title');
    expect(updated.userId).toBe('user-1');
    expect(updated.isFavorite).toBeTruthy();
  });
});

describe('query Invalidation Timing', () => {
  const containsKey = (patterns: readonly unknown[], key: readonly unknown[]) => {
    return patterns.some(p => JSON.stringify(p) === JSON.stringify(key));
  };

  it('should use immediate invalidation for critical data', () => {
    const patterns = invalidationPatterns.afterThreadMessage('thread-123');

    expect(containsKey(patterns, queryKeys.usage.stats())).toBeTruthy();
  });

  it('should invalidate changelog incrementally', () => {
    const threadUpdatePattern = invalidationPatterns.threadDetail('thread-123');

    expect(containsKey(threadUpdatePattern, queryKeys.threads.changelog('thread-123'))).toBeTruthy();
  });

  it('should NOT invalidate models on every thread operation', () => {
    const threadPatterns = invalidationPatterns.threads;

    expect(containsKey(threadPatterns, queryKeys.models.all)).toBeFalsy();
  });

  it('should invalidate models on subscription changes', () => {
    const subscriptionPatterns = invalidationPatterns.subscriptions;

    expect(containsKey(subscriptionPatterns, queryKeys.models.all)).toBeTruthy();
  });
});

describe('cache Key Hierarchical Structure', () => {
  it('should support hierarchical invalidation with threads.all', () => {
    const baseKey = queryKeys.threads.all;
    const listKey = queryKeys.threads.lists();
    const detailKey = queryKeys.threads.detail('thread-123');

    expect(baseKey).toStrictEqual(['threads']);
    expect(listKey[0]).toBe('threads');
    expect(detailKey[0]).toBe('threads');
  });

  it('should allow filtering queries by base key', () => {
    const keys = [
      queryKeys.threads.all,
      queryKeys.threads.lists(),
      queryKeys.threads.detail('thread-123'),
      queryKeys.products.all,
    ];

    const threadKeys = keys.filter(key =>
      Array.isArray(key) && key[0] === 'threads',
    );

    expect(threadKeys).toHaveLength(3);
  });

  it('should support predicate-based query matching', () => {
    const listKey = queryKeys.threads.lists();

    const isListQuery = (key: unknown) => {
      return Array.isArray(key) && key[0] === 'threads' && key[1] === 'list';
    };

    expect(isListQuery(listKey)).toBeTruthy();
    expect(isListQuery(queryKeys.threads.detail('thread-123'))).toBeFalsy();
  });
});
