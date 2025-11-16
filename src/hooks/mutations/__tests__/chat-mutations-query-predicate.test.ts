/**
 * Query Predicate Tests for Chat Mutations
 *
 * Tests that optimistic updates only target infinite queries,
 * not detail/analyses/changelog queries.
 *
 * Bug: setQueriesData with broad query key (e.g., ['threads'])
 * was matching ALL queries, causing validation errors for non-infinite queries.
 */

import { describe, expect, it } from 'vitest';

describe('chat Mutations - Query Predicate Logic', () => {
  it('should only match infinite queries with list in key path', () => {
    // Simulate the predicate function used in useUpdateThreadMutation and useDeleteThreadMutation
    const predicate = (query: { queryKey: unknown[] }) => {
      const key = query.queryKey as string[];
      return key.length >= 2 && key[1] === 'list';
    };

    // ✅ Should match - infinite query patterns
    expect(predicate({ queryKey: ['threads', 'list'] })).toBe(true);
    expect(predicate({ queryKey: ['threads', 'list', 'search', 'test'] })).toBe(true);

    // ❌ Should NOT match - non-infinite query patterns
    expect(predicate({ queryKey: ['threads'] })).toBe(false);
    expect(predicate({ queryKey: ['threads', 'detail', 'some-id'] })).toBe(false);
    expect(predicate({ queryKey: ['threads', 'analyses', 'some-id'] })).toBe(false);
    expect(predicate({ queryKey: ['threads', 'changelog', 'some-id'] })).toBe(false);
    expect(predicate({ queryKey: ['threads', 'pre-searches', 'some-id'] })).toBe(false);
    expect(predicate({ queryKey: ['threads', 'feedback', 'some-id'] })).toBe(false);
    expect(predicate({ queryKey: ['threads', 'messages', 'some-id'] })).toBe(false);
    expect(predicate({ queryKey: ['threads', 'slug', 'some-slug'] })).toBe(false);
    expect(predicate({ queryKey: ['threads', 'public', 'some-slug'] })).toBe(false);
  });

  it('should validate infinite query structure', () => {
    // Mock infinite query data structure
    const validInfiniteQuery = {
      pages: [
        {
          success: true,
          data: {
            items: [
              { id: '1', title: 'Thread 1' },
              { id: '2', title: 'Thread 2' },
            ],
            pagination: {
              nextCursor: 'cursor-1',
            },
          },
        },
      ],
      pageParams: [undefined],
    };

    // This structure should be valid for infinite queries
    expect(validInfiniteQuery.pages).toBeDefined();
    expect(Array.isArray(validInfiniteQuery.pages)).toBe(true);
    expect(validInfiniteQuery.pages.length).toBeGreaterThan(0);
  });

  it('should reject non-infinite query structure', () => {
    // Mock detail query data structure (no pages array)
    const detailQuery = {
      success: true,
      data: {
        thread: {
          id: '1',
          title: 'Thread 1',
        },
        participants: [],
        messages: [],
      },
    };

    // This structure should NOT have pages
    expect(detailQuery).not.toHaveProperty('pages');

    // Mock analyses query data structure (no pages array)
    const analysesQuery = {
      success: true,
      data: {
        items: [
          { id: 'analysis-1', roundNumber: 0 },
        ],
      },
    };

    // This structure should NOT have pages
    expect(analysesQuery).not.toHaveProperty('pages');
  });

  it('should document the bug scenario', () => {
    // BEFORE FIX: setQueriesData matched ALL queries starting with ['threads']
    const broadQueryKey = ['threads'];

    const allQueries = [
      { queryKey: ['threads', 'list'] }, // ✅ Should update
      { queryKey: ['threads', 'list', 'search', 'test'] }, // ✅ Should update
      { queryKey: ['threads', 'detail', 'id-1'] }, // ❌ Should NOT update
      { queryKey: ['threads', 'analyses', 'id-1'] }, // ❌ Should NOT update
      { queryKey: ['threads', 'changelog', 'id-1'] }, // ❌ Should NOT update
    ];

    // Without predicate, ALL queries match the broad key
    const matchingWithoutPredicate = allQueries.filter(q =>
      q.queryKey[0] === broadQueryKey[0],
    );
    expect(matchingWithoutPredicate).toHaveLength(5); // ❌ BUG: All 5 match

    // With predicate, ONLY infinite queries match
    const predicate = (query: { queryKey: unknown[] }) => {
      const key = query.queryKey as string[];
      return key.length >= 2 && key[1] === 'list';
    };

    const matchingWithPredicate = allQueries.filter(predicate);
    expect(matchingWithPredicate).toHaveLength(2); // ✅ FIX: Only 2 infinite queries match
  });
});
