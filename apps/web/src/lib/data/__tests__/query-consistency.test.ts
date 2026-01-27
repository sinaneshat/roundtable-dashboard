/**
 * Query Consistency Tests
 *
 * Ensures SSR/client query options are consistent to prevent:
 * - Hydration mismatches causing refetches
 * - Different staleTime values between server and client
 * - Query key mismatches causing cache misses
 *
 * These tests catch the issues that caused excessive API calls.
 */

import { describe, expect, it } from 'vitest';

import { queryKeys } from '../query-keys';
import {
  modelsQueryOptions,
  productsQueryOptions,
  sidebarThreadsQueryOptions,
  subscriptionsQueryOptions,
  threadBySlugQueryOptions,
  usageQueryOptions,
} from '../query-options';
import { STALE_TIMES } from '../stale-times';

describe('query consistency - SSR/client alignment', () => {
  describe('staleTime consistency', () => {
    it('subscriptionsQueryOptions.staleTime matches STALE_TIMES.subscriptions', () => {
      // This test prevents the issue where STALE_TIMES.subscriptions was 0
      // but subscriptionsQueryOptions used 60 * 1000, causing SSR/client mismatch
      expect(subscriptionsQueryOptions.staleTime).toBe(STALE_TIMES.subscriptions);
    });

    it('productsQueryOptions.staleTime matches STALE_TIMES.products', () => {
      expect(productsQueryOptions.staleTime).toBe(STALE_TIMES.products);
    });

    it('modelsQueryOptions.staleTime matches STALE_TIMES.models', () => {
      expect(modelsQueryOptions.staleTime).toBe(STALE_TIMES.models);
    });

    it('sidebarThreadsQueryOptions.staleTime matches STALE_TIMES.threadsSidebar', () => {
      expect(sidebarThreadsQueryOptions.staleTime).toBe(STALE_TIMES.threadsSidebar);
    });

    it('threadBySlugQueryOptions.staleTime matches STALE_TIMES.threadDetail', () => {
      const options = threadBySlugQueryOptions('test-slug');
      expect(options.staleTime).toBe(STALE_TIMES.threadDetail);
    });
  });

  describe('queryKey consistency', () => {
    it('subscriptionsQueryOptions uses correct queryKey', () => {
      expect(subscriptionsQueryOptions.queryKey).toEqual(queryKeys.subscriptions.current());
    });

    it('productsQueryOptions uses correct queryKey', () => {
      expect(productsQueryOptions.queryKey).toEqual(queryKeys.products.list());
    });

    it('modelsQueryOptions uses correct queryKey', () => {
      expect(modelsQueryOptions.queryKey).toEqual(queryKeys.models.list());
    });

    it('sidebarThreadsQueryOptions uses correct queryKey', () => {
      expect(sidebarThreadsQueryOptions.queryKey).toEqual(queryKeys.threads.sidebar());
    });

    it('threadBySlugQueryOptions uses correct queryKey factory', () => {
      const testSlug = 'my-test-thread';
      const options = threadBySlugQueryOptions(testSlug);
      expect(options.queryKey).toEqual(queryKeys.threads.bySlug(testSlug));
    });
  });

  describe('refetch behavior consistency', () => {
    it('subscriptionsQueryOptions disables automatic refetch to prevent SSR/client flash', () => {
      expect(subscriptionsQueryOptions.refetchOnWindowFocus).toBeFalsy();
      expect(subscriptionsQueryOptions.refetchOnMount).toBeFalsy();
    });

    it('productsQueryOptions disables automatic refetch', () => {
      expect(productsQueryOptions.refetchOnWindowFocus).toBeFalsy();
      expect(productsQueryOptions.refetchOnMount).toBeFalsy();
    });

    it('modelsQueryOptions disables automatic refetch', () => {
      expect(modelsQueryOptions.refetchOnWindowFocus).toBeFalsy();
      expect(modelsQueryOptions.refetchOnMount).toBeFalsy();
    });

    it('sidebarThreadsQueryOptions disables automatic refetch', () => {
      expect(sidebarThreadsQueryOptions.refetchOnWindowFocus).toBeFalsy();
      expect(sidebarThreadsQueryOptions.refetchOnMount).toBeFalsy();
    });

    it('threadBySlugQueryOptions disables automatic refetch', () => {
      const options = threadBySlugQueryOptions('test');
      expect(options.refetchOnWindowFocus).toBeFalsy();
      expect(options.refetchOnMount).toBeFalsy();
    });

    it('usageQueryOptions disables automatic refetch', () => {
      expect(usageQueryOptions.refetchOnWindowFocus).toBeFalsy();
      expect(usageQueryOptions.refetchOnMount).toBeFalsy();
    });
  });
});

describe('stale time values', () => {
  it('subscriptions staleTime should NOT be 0 (prevents hydration mismatch)', () => {
    // This test catches the bug where subscriptions was set to 0, causing
    // immediate refetch after SSR hydration
    expect(STALE_TIMES.subscriptions).toBeGreaterThan(0);
    expect(STALE_TIMES.subscriptions).toBe(60 * 1000); // 1 minute
  });

  it('products staleTime should be 24 hours (matches ISR)', () => {
    expect(STALE_TIMES.products).toBe(24 * 3600 * 1000);
  });

  it('models staleTime should be Infinity (never auto-refetch)', () => {
    expect(STALE_TIMES.models).toBe(Infinity);
  });

  it('threadDetail staleTime should be 0 (NO CACHE - real-time collaboration)', () => {
    // Private threads must always be fresh for real-time collaboration
    expect(STALE_TIMES.threadDetail).toBe(0);
  });

  it('threadsSidebar staleTime should be 30 seconds', () => {
    expect(STALE_TIMES.threadsSidebar).toBe(30 * 1000);
  });

  describe('one-way data flow patterns should use Infinity', () => {
    it('threadChangelog should be Infinity (immutable data)', () => {
      expect(STALE_TIMES.threadChangelog).toBe(Infinity);
    });

    it('threadModerators should be Infinity (immutable data)', () => {
      expect(STALE_TIMES.threadModerators).toBe(Infinity);
    });

    it('preSearch should be Infinity (ONE-WAY DATA FLOW)', () => {
      expect(STALE_TIMES.preSearch).toBe(Infinity);
    });
  });
});

describe('queryKeys structure', () => {
  it('threads.detail and threads.bySlug should have different structures', () => {
    const threadId = 'test-id-123';
    const slug = 'test-slug';

    const detailKey = queryKeys.threads.detail(threadId);
    const bySlugKey = queryKeys.threads.bySlug(slug);

    // These MUST be different to allow separate cache entries
    expect(detailKey).not.toEqual(bySlugKey);

    // Verify expected structures
    expect(detailKey).toEqual(['threads', 'detail', threadId]);
    expect(bySlugKey).toEqual(['threads', 'slug', slug]);
  });

  it('all query keys should be arrays', () => {
    expect(Array.isArray(queryKeys.threads.all)).toBeTruthy();
    expect(Array.isArray(queryKeys.threads.lists())).toBeTruthy();
    expect(Array.isArray(queryKeys.threads.sidebar())).toBeTruthy();
    expect(Array.isArray(queryKeys.threads.detail('id'))).toBeTruthy();
    expect(Array.isArray(queryKeys.threads.bySlug('slug'))).toBeTruthy();
    expect(Array.isArray(queryKeys.products.list())).toBeTruthy();
    expect(Array.isArray(queryKeys.subscriptions.current())).toBeTruthy();
    expect(Array.isArray(queryKeys.models.list())).toBeTruthy();
    expect(Array.isArray(queryKeys.usage.stats())).toBeTruthy();
  });
});

describe('shared queryOptions export verification', () => {
  it('all shared queryOptions should be exported from query-options.ts', () => {
    // These are the queryOptions that should be shared between SSR loaders and client hooks
    expect(modelsQueryOptions).toBeDefined();
    expect(subscriptionsQueryOptions).toBeDefined();
    expect(usageQueryOptions).toBeDefined();
    expect(sidebarThreadsQueryOptions).toBeDefined();
    expect(threadBySlugQueryOptions).toBeDefined();
    expect(productsQueryOptions).toBeDefined();
  });

  it('queryOptions should have queryFn defined', () => {
    expect(typeof modelsQueryOptions.queryFn).toBe('function');
    expect(typeof subscriptionsQueryOptions.queryFn).toBe('function');
    expect(typeof usageQueryOptions.queryFn).toBe('function');
    expect(typeof sidebarThreadsQueryOptions.queryFn).toBe('function');
    expect(typeof productsQueryOptions.queryFn).toBe('function');
    expect(typeof threadBySlugQueryOptions('test').queryFn).toBe('function');
  });
});
