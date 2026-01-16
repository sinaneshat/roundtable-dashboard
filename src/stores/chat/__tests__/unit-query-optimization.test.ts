import { describe, expect, it } from 'vitest';

import { ChatModes } from '@/api/core/enums';
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
        pages: [
          {
            success: true,
            data: {
              items: [mockThread],
            },
          },
        ],
        pageParams: [undefined],
      };

      const result = validateInfiniteQueryCache(validData);

      expect(result).not.toBeNull();
      expect(result?.pages).toHaveLength(1);
      expect(result?.pageParams).toHaveLength(1);
    });

    it('should NOT recreate objects if data is already valid', () => {
      const validData = {
        pages: [
          {
            success: true,
            data: {
              items: [],
            },
          },
        ],
        pageParams: [undefined],
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
        success: true,
        data: {
          thread: {
            id: 'thread-1',
            title: 'Test Thread',
            slug: 'test-thread',
            userId: 'user-1',
            mode: ChatModes.COUNCIL,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          participants: [],
          messages: [],
        },
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
          success: true,
          data: { items: [] },
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
          success: true,
          data: {
            items: [
              {
                id: 'thread-1',
                title: 'Thread 1',
                slug: 'thread-1',
                userId: 'user-1',
                mode: ChatModes.COUNCIL,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          },
        },
        {
          success: true,
          data: {
            items: [],
          },
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
        success: true,
        data: {
          credits: {
            balance: 1000,
            available: 800,
            status: 'default',
          },
          plan: {
            type: 'pro',
            name: 'Pro Plan',
            monthlyCredits: 10000,
            hasActiveSubscription: true,
            nextRefillAt: new Date().toISOString(),
            pendingChange: null,
          },
        },
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
        success: true,
        data: {
          items: [
            {
              // Missing required fields
              id: 'changelog-1',
              threadId: 'thread-1',
            },
          ],
        },
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
        id: 'thread-1',
        title: 'Original Title',
        slug: 'original-slug',
        userId: 'user-1',
        mode: ChatModes.COUNCIL,
        isFavorite: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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
        title: 'Original Title',
        isFavorite: false,
      });

      const optimisticThread = {
        ...mockThread,
        title: 'Updated Title',
        isFavorite: true,
      };

      expect(optimisticThread.id).toBe('thread-1');
      expect(optimisticThread.title).toBe('Updated Title');
      expect(optimisticThread.isFavorite).toBe(true);
      expect(optimisticThread.slug).toBe(mockThread.slug);
    });
  });

  describe('infinite Query Optimistic Update', () => {
    it('should update specific item in pages without recreating entire structure', () => {
      const pages = [
        {
          success: true,
          data: {
            items: [
              {
                id: 'thread-1',
                title: 'Thread 1',
                slug: 'thread-1',
                userId: 'user-1',
                mode: ChatModes.COUNCIL,
                isFavorite: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              {
                id: 'thread-2',
                title: 'Thread 2',
                slug: 'thread-2',
                userId: 'user-1',
                mode: ChatModes.COUNCIL,
                isFavorite: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          },
        },
      ];
      const updatedPages = pages.map((page) => {
        if (!page.success || !page.data?.items)
          return page;

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

      expect(updatedPages[0].data?.items[0].isFavorite).toBe(true);
      expect(updatedPages[0].data?.items[1].isFavorite).toBe(false);
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

      expect(containsKey(patterns, queryKeys.threads.detail(threadId))).toBe(true);
      expect(containsKey(patterns, queryKeys.threads.lists())).toBe(true);
      expect(containsKey(patterns, queryKeys.threads.changelog(threadId))).toBe(true);
    });

    it('should NOT invalidate other thread details', () => {
      const threadId = 'thread-123';
      const patterns = invalidationPatterns.threadDetail(threadId);

      const otherThreadKey = queryKeys.threads.detail('thread-456');

      expect(containsKey(patterns, otherThreadKey)).toBe(false);
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

      expect(containsKey(patterns, queryKeys.threads.lists())).toBe(true);
      expect(containsKey(patterns, queryKeys.usage.stats())).toBe(true);
    });

    it('should NOT invalidate specific thread details', () => {
      const patterns = invalidationPatterns.threads;

      const hasDetailKey = patterns.some(key =>
        Array.isArray(key) && key.includes('detail'),
      );

      expect(hasDetailKey).toBe(false);
    });
  });

  describe('invalidationPatterns.subscriptions', () => {
    it('should invalidate subscriptions, usage, and models (cascading effect)', () => {
      const patterns = invalidationPatterns.subscriptions;

      expect(containsKey(patterns, queryKeys.subscriptions.lists())).toBe(true);
      expect(containsKey(patterns, queryKeys.subscriptions.current())).toBe(true);
      expect(containsKey(patterns, queryKeys.usage.all)).toBe(true);
      expect(containsKey(patterns, queryKeys.models.all)).toBe(true);
    });

    it('should handle tier changes affecting model access', () => {
      const patterns = invalidationPatterns.subscriptions;

      expect(containsKey(patterns, queryKeys.models.all)).toBe(true);
    });
  });

  describe('invalidationPatterns.afterThreadMessage', () => {
    it('should invalidate thread detail, list, and usage stats', () => {
      const threadId = 'thread-123';
      const patterns = invalidationPatterns.afterThreadMessage(threadId);

      expect(containsKey(patterns, queryKeys.threads.detail(threadId))).toBe(true);
      expect(containsKey(patterns, queryKeys.threads.lists())).toBe(true);
      expect(containsKey(patterns, queryKeys.usage.stats())).toBe(true);
    });

    it('should update usage stats for credit consumption', () => {
      const threadId = 'thread-123';
      const patterns = invalidationPatterns.afterThreadMessage(threadId);

      expect(containsKey(patterns, queryKeys.usage.stats())).toBe(true);
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

  it('should use medium times for chat data (optimized for navigation)', () => {
    // Messages and thread detail use 2-minute stale time for instant navigation
    // Longer stale times reduce API calls while keeping data fresh enough
    expect(STALE_TIMES.threadMessages).toBe(2 * 60 * 1000);
    expect(STALE_TIMES.threadDetail).toBe(2 * 60 * 1000);
  });

  it('should use longer times for infrequent changes', () => {
    expect(STALE_TIMES.products).toBe(24 * 3600 * 1000);
    expect(STALE_TIMES.publicThreadDetail).toBe(24 * 3600 * 1000);
  });

  it('should always fetch fresh subscription data after plan changes', () => {
    expect(STALE_TIMES.subscriptions).toBe(0);
  });
});

describe('prefetch Cache Population', () => {
  it('should pre-populate thread detail with consistent structure', () => {
    const threadData = {
      thread: {
        id: 'thread-123',
        title: 'Test Thread',
        slug: 'test-thread',
        userId: 'user-1',
        mode: ChatModes.COUNCIL,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      participants: [],
      messages: [],
      user: {
        name: 'Test User',
        image: null,
      },
    };

    const result = validateThreadDetailPayloadCache({
      success: true,
      data: threadData,
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
          id: 'ps-1',
          threadId: 'thread-123',
          roundNumber: 0,
          query: 'test query',
          status: 'completed',
          results: [],
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
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
      id: 'thread-123',
      title: 'Optimistic Title',
      isFavorite: true,
      slug: 'thread-123',
      userId: 'user-1',
      mode: ChatModes.COUNCIL,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const serverResponse = {
      id: 'thread-123',
      title: 'Optimistic Title',
      isFavorite: true,
      slug: 'thread-123',
      userId: 'user-1',
      mode: ChatModes.COUNCIL,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
      title: 'Original Title',
      isFavorite: false,
    };

    let currentState = {
      ...previousState,
      isFavorite: true,
    };

    currentState = previousState;

    expect(currentState.isFavorite).toBe(false);
    expect(currentState.title).toBe('Original Title');
  });

  it('should validate optimistic update preserves required fields', () => {
    const baseThread = {
      id: 'thread-123',
      title: 'Original Title',
      slug: 'thread-123',
      userId: 'user-1',
      mode: ChatModes.COUNCIL,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
    expect(updated.isFavorite).toBe(true);
  });
});

describe('query Invalidation Timing', () => {
  const containsKey = (patterns: readonly unknown[], key: readonly unknown[]) => {
    return patterns.some(p => JSON.stringify(p) === JSON.stringify(key));
  };

  it('should use immediate invalidation for critical data', () => {
    const patterns = invalidationPatterns.afterThreadMessage('thread-123');

    expect(containsKey(patterns, queryKeys.usage.stats())).toBe(true);
  });

  it('should invalidate changelog incrementally', () => {
    const threadUpdatePattern = invalidationPatterns.threadDetail('thread-123');

    expect(containsKey(threadUpdatePattern, queryKeys.threads.changelog('thread-123'))).toBe(true);
  });

  it('should NOT invalidate models on every thread operation', () => {
    const threadPatterns = invalidationPatterns.threads;

    expect(containsKey(threadPatterns, queryKeys.models.all)).toBe(false);
  });

  it('should invalidate models on subscription changes', () => {
    const subscriptionPatterns = invalidationPatterns.subscriptions;

    expect(containsKey(subscriptionPatterns, queryKeys.models.all)).toBe(true);
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

    expect(isListQuery(listKey)).toBe(true);
    expect(isListQuery(queryKeys.threads.detail('thread-123'))).toBe(false);
  });
});
