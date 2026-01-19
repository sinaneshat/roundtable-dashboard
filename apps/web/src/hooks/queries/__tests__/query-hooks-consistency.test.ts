/**
 * Query Hooks Consistency Tests
 *
 * Ensures query hooks don't override shared queryOptions with different values,
 * which would cause SSR/client mismatches and excessive API calls.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GC_TIMES, STALE_TIMES } from '@/lib/data/stale-times';

// Mock all services before imports
vi.mock('@/services/api', () => ({
  listApiKeysService: vi.fn(),
  getApiKeyService: vi.fn(),
  getProductsService: vi.fn(),
  getProductService: vi.fn(),
  getThreadBySlugService: vi.fn(),
  getThreadService: vi.fn(),
  listThreadsService: vi.fn(),
  getPublicThreadService: vi.fn(),
  listPublicThreadSlugsService: vi.fn(),
  getThreadSlugStatusService: vi.fn(),
}));

// Mock server functions
vi.mock('@/server/models', () => ({
  getModels: vi.fn(),
}));
vi.mock('@/server/products', () => ({
  getProducts: vi.fn(),
}));
vi.mock('@/server/subscriptions', () => ({
  getSubscriptions: vi.fn(),
}));
vi.mock('@/server/usage-stats', () => ({
  getUsageStats: vi.fn(),
}));
vi.mock('@/server/sidebar-threads', () => ({
  getSidebarThreads: vi.fn(),
}));
vi.mock('@/server/thread', () => ({
  getThreadBySlug: vi.fn(),
}));

// Mock auth hook
vi.mock('@/hooks/utils', () => ({
  useAuthCheck: () => ({ isAuthenticated: true }),
}));

// Mock auth client
vi.mock('@/lib/auth/client', () => ({
  useSession: () => ({ data: { user: { id: 'test-user' } } }),
}));

// Helper to read file content for static analysis
function readHookFile(relativePath: string): string {
  const fullPath = resolve(__dirname, '../../..', relativePath);
  return readFileSync(fullPath, 'utf-8');
}

describe('useApiKeysQuery - no refetchOnMount override', () => {
  it('should NOT have refetchOnMount: "always" (causes excessive API calls)', () => {
    const fileContent = readHookFile('hooks/queries/api-keys.ts');

    // Check that refetchOnMount: 'always' is NOT present
    expect(fileContent).not.toMatch(/refetchOnMount:\s*['"]always['"]/);

    // Verify refetchOnMount is set to false
    expect(fileContent).toMatch(/refetchOnMount:\s*false/);
  });

  it('should use STALE_TIMES.apiKeys for staleTime', () => {
    const fileContent = readHookFile('hooks/queries/api-keys.ts');
    expect(fileContent).toMatch(/staleTime:\s*STALE_TIMES\.apiKeys/);
  });

  it('should use GC_TIMES.STANDARD for gcTime', () => {
    const fileContent = readHookFile('hooks/queries/api-keys.ts');
    expect(fileContent).toMatch(/gcTime:\s*GC_TIMES\.STANDARD/);
  });
});

describe('useThreadBySlugQuery - uses shared queryOptions', () => {
  it('should import threadBySlugQueryOptions from query-options.ts', () => {
    const fileContent = readHookFile('hooks/queries/chat/threads.ts');
    expect(fileContent).toMatch(/import\s*\{[^}]*threadBySlugQueryOptions[^}]*\}\s*from\s*['"]@\/lib\/data\/query-options['"]/);
  });

  it('should spread threadBySlugQueryOptions in useQuery call', () => {
    const fileContent = readHookFile('hooks/queries/chat/threads.ts');
    // Check that the hook uses the spread operator with the shared queryOptions
    expect(fileContent).toMatch(/\.\.\.threadBySlugQueryOptions\(slug\)/);
  });

  it('should NOT define its own queryFn (should come from shared options)', () => {
    const fileContent = readHookFile('hooks/queries/chat/threads.ts');

    // Should NOT have a standalone queryFn with getThreadBySlugService
    // The queryFn comes from the spread of threadBySlugQueryOptions
    expect(fileContent).not.toMatch(/queryFn:\s*\(\)\s*=>\s*getThreadBySlugService/);
  });
});

describe('useProductsQuery - uses shared queryOptions', () => {
  it('should import productsQueryOptions from query-options.ts', () => {
    const fileContent = readHookFile('hooks/queries/products.ts');
    expect(fileContent).toMatch(/import\s*\{[^}]*productsQueryOptions[^}]*\}\s*from\s*['"]@\/lib\/data\/query-options['"]/);
  });

  it('should spread productsQueryOptions in useProductsQuery call', () => {
    const fileContent = readHookFile('hooks/queries/products.ts');
    expect(fileContent).toMatch(/\.\.\.productsQueryOptions/);
  });

  it('should still export useProductQuery for individual product fetching', () => {
    const fileContent = readHookFile('hooks/queries/products.ts');
    expect(fileContent).toMatch(/export function useProductQuery/);
  });
});

describe('pricing.tsx route - uses shared queryOptions', () => {
  it('should import productsQueryOptions and subscriptionsQueryOptions', () => {
    const fileContent = readHookFile('routes/_protected/chat/pricing.tsx');
    expect(fileContent).toMatch(/import\s*\{[^}]*productsQueryOptions[^}]*\}\s*from\s*['"]@\/lib\/data\/query-options['"]/);
    expect(fileContent).toMatch(/subscriptionsQueryOptions/);
  });

  it('should NOT import getProducts or getSubscriptions directly', () => {
    const fileContent = readHookFile('routes/_protected/chat/pricing.tsx');
    // Should NOT have direct server function imports (now using queryOptions)
    expect(fileContent).not.toMatch(/import\s*\{[^}]*getProducts[^}]*\}\s*from\s*['"]@\/server\/products['"]/);
    expect(fileContent).not.toMatch(/import\s*\{[^}]*getSubscriptions[^}]*\}\s*from\s*['"]@\/server\/subscriptions['"]/);
  });

  it('should NOT use inline staleTime in prefetchQuery (uses queryOptions instead)', () => {
    const fileContent = readHookFile('routes/_protected/chat/pricing.tsx');
    // The loader should use prefetchQuery(productsQueryOptions) not prefetchQuery({ staleTime: ... })
    // Check that staleTime is NOT specified inline in the loader
    expect(fileContent).not.toMatch(/prefetchQuery\(\s*\{[\s\S]*staleTime:/);
  });

  it('should use prefetchQuery with shared queryOptions', () => {
    const fileContent = readHookFile('routes/_protected/chat/pricing.tsx');
    expect(fileContent).toMatch(/prefetchQuery\(productsQueryOptions\)/);
    expect(fileContent).toMatch(/prefetchQuery\(subscriptionsQueryOptions\)/);
  });
});

describe('stale time values are properly set', () => {
  it('subscriptions staleTime should be 60 seconds (not 0)', () => {
    // This is critical - 0 would cause immediate refetch after SSR
    expect(STALE_TIMES.subscriptions).toBe(60 * 1000);
  });

  it('gc times should have expected values', () => {
    expect(GC_TIMES.STANDARD).toBe(5 * 60 * 1000);
    expect(GC_TIMES.INFINITE).toBe(Infinity);
  });

  it('one-way data flow patterns should use Infinity', () => {
    expect(STALE_TIMES.threadChangelog).toBe(Infinity);
    expect(STALE_TIMES.preSearch).toBe(Infinity);
    expect(STALE_TIMES.threadFeedback).toBe(Infinity);
  });
});

afterEach(() => {
  vi.clearAllMocks();
});
