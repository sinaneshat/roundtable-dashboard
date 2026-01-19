/**
 * Query Key Factory System
 *
 * Centralized query key generation for TanStack Query
 * Ensures consistency between server prefetch and client queries
 * Prevents cache mismatches and enables hierarchical invalidation
 */

import type { QueryClient } from '@tanstack/react-query';

import { getUserUsageStatsService, listModelsService } from '@/services/api';

/**
 * Factory functions for type-safe query key generation
 */
const QueryKeyFactory = {
  base: (resource: string) => [resource] as const,
  list: (resource: string) => [resource, 'list'] as const,
  detail: (resource: string, id: string) => [resource, 'detail', id] as const,
  current: (resource: string) => [resource, 'current'] as const,
  all: (resource: string) => [resource, 'all'] as const,
  action: (resource: string, action: string, ...params: string[]) =>
    [resource, action, ...params] as const,
} as const;

/**
 * Billing domain query keys
 */
export const queryKeys = {
  // Products
  products: {
    all: QueryKeyFactory.base('products'),
    lists: () => [...queryKeys.products.all, 'list'] as const,
    list: () => QueryKeyFactory.list('products'),
    details: () => [...queryKeys.products.all, 'detail'] as const,
    detail: (id: string) => QueryKeyFactory.detail('products', id),
  },

  // Subscriptions
  subscriptions: {
    all: QueryKeyFactory.base('subscriptions'),
    lists: () => [...queryKeys.subscriptions.all, 'list'] as const,
    list: () => QueryKeyFactory.list('subscriptions'),
    details: () => [...queryKeys.subscriptions.all, 'detail'] as const,
    detail: (id: string) => QueryKeyFactory.detail('subscriptions', id),
    current: () => QueryKeyFactory.current('subscriptions'),
  },

  // Checkout
  checkout: {
    all: QueryKeyFactory.base('checkout'),
    session: (sessionId: string) => QueryKeyFactory.action('checkout', 'session', sessionId),
  },

  // Usage Tracking
  usage: {
    all: QueryKeyFactory.base('usage'),
    stats: () => QueryKeyFactory.action('usage', 'stats'),
    quotas: () => [...queryKeys.usage.all, 'quotas'] as const,
  },

  // Chat Threads
  threads: {
    all: QueryKeyFactory.base('threads'),
    lists: (search?: string) =>
      search
        ? [...queryKeys.threads.all, 'list', 'search', search] as const
        : [...queryKeys.threads.all, 'list'] as const,
    list: (cursor?: string) =>
      cursor
        ? QueryKeyFactory.action('threads', 'list', cursor)
        : QueryKeyFactory.list('threads'),
    sidebar: (search?: string) =>
      search
        ? [...queryKeys.threads.all, 'sidebar', 'search', search] as const
        : [...queryKeys.threads.all, 'sidebar'] as const,
    details: () => [...queryKeys.threads.all, 'detail'] as const,
    detail: (id: string) => QueryKeyFactory.detail('threads', id),
    public: (slug: string) => QueryKeyFactory.action('threads', 'public', slug),
    publicSlugs: () => QueryKeyFactory.action('threads', 'public', 'slugs'),
    bySlug: (slug: string) => QueryKeyFactory.action('threads', 'slug', slug),
    slugStatus: (id: string) => QueryKeyFactory.action('threads', 'slug-status', id),
    messages: (id: string) => QueryKeyFactory.action('threads', 'messages', id),
    changelog: (id: string) => QueryKeyFactory.action('threads', 'changelog', id),
    roundChangelog: (id: string, roundNumber: number) =>
      QueryKeyFactory.action('threads', 'changelog', id, 'round', String(roundNumber)),
    preSearches: (id: string) => QueryKeyFactory.action('threads', 'pre-searches', id),
    feedback: (id: string) => QueryKeyFactory.action('threads', 'feedback', id),
    streamResumption: (id: string) => QueryKeyFactory.action('threads', 'stream-resumption', id),
  },

  // Chat Custom Roles
  customRoles: {
    all: QueryKeyFactory.base('customRoles'),
    lists: () => [...queryKeys.customRoles.all, 'list'] as const,
    list: (cursor?: string) =>
      cursor
        ? QueryKeyFactory.action('customRoles', 'list', cursor)
        : QueryKeyFactory.list('customRoles'),
    details: () => [...queryKeys.customRoles.all, 'detail'] as const,
    detail: (id: string) => QueryKeyFactory.detail('customRoles', id),
  },

  // User Presets (saved model+role configurations)
  userPresets: {
    all: QueryKeyFactory.base('userPresets'),
    lists: () => [...queryKeys.userPresets.all, 'list'] as const,
    list: (cursor?: string) =>
      cursor
        ? QueryKeyFactory.action('userPresets', 'list', cursor)
        : QueryKeyFactory.list('userPresets'),
    details: () => [...queryKeys.userPresets.all, 'detail'] as const,
    detail: (id: string) => QueryKeyFactory.detail('userPresets', id),
  },

  // API Keys
  apiKeys: {
    all: QueryKeyFactory.base('apiKeys'),
    lists: () => [...queryKeys.apiKeys.all, 'list'] as const,
    list: () => QueryKeyFactory.list('apiKeys'),
    details: () => [...queryKeys.apiKeys.all, 'detail'] as const,
    detail: (id: string) => QueryKeyFactory.detail('apiKeys', id),
  },

  // OpenRouter Models
  models: {
    all: QueryKeyFactory.base('models'),
    list: () => QueryKeyFactory.list('models'),
  },

  // Projects
  projects: {
    all: QueryKeyFactory.base('projects'),
    lists: (search?: string) =>
      search
        ? [...queryKeys.projects.all, 'list', 'search', search] as const
        : [...queryKeys.projects.all, 'list'] as const,
    list: (cursor?: string) =>
      cursor
        ? QueryKeyFactory.action('projects', 'list', cursor)
        : QueryKeyFactory.list('projects'),
    details: () => [...queryKeys.projects.all, 'detail'] as const,
    detail: (id: string) => QueryKeyFactory.detail('projects', id),
    attachments: (id: string) => QueryKeyFactory.action('projects', 'attachments', id),
    memories: (id: string) => QueryKeyFactory.action('projects', 'memories', id),
    context: (id: string) => QueryKeyFactory.action('projects', 'context', id),
  },

  // Uploads (Centralized file storage)
  // Note: Thread/message associations are via junction tables, not direct queries
  uploads: {
    all: QueryKeyFactory.base('uploads'),
    lists: () => [...queryKeys.uploads.all, 'list'] as const,
    list: (cursor?: string) =>
      cursor
        ? QueryKeyFactory.action('uploads', 'list', cursor)
        : QueryKeyFactory.list('uploads'),
    details: () => [...queryKeys.uploads.all, 'detail'] as const,
    detail: (id: string) => QueryKeyFactory.detail('uploads', id),
    downloadUrl: (id: string) => QueryKeyFactory.action('uploads', 'downloadUrl', id),
  },
} as const;

/**
 * Invalidation patterns for common operations
 * Use these to invalidate related queries after mutations
 */
export const invalidationPatterns = {
  // Product operations
  products: [queryKeys.products.all],

  productDetail: (productId: string) => [
    queryKeys.products.detail(productId),
    queryKeys.products.lists(),
  ],

  // Subscription operations
  // IMPORTANT: Always invalidate usage queries with subscriptions since quotas are tied to subscription tier
  subscriptions: [
    queryKeys.subscriptions.lists(),
    queryKeys.subscriptions.current(),
    queryKeys.usage.all,
    queryKeys.models.all,
  ],

  subscriptionDetail: (subscriptionId: string) => [
    queryKeys.subscriptions.detail(subscriptionId),
    queryKeys.subscriptions.lists(),
    queryKeys.subscriptions.current(),
    queryKeys.usage.all,
    queryKeys.models.all,
  ],

  afterCheckout: [
    queryKeys.subscriptions.all,
    queryKeys.products.all,
    queryKeys.usage.all,
    queryKeys.models.all,
  ],

  // Usage operations - invalidate after chat operations
  usage: [
    queryKeys.usage.stats(),
    queryKeys.usage.quotas(),
  ],

  // After chat operations - invalidate usage stats
  afterChatOperation: [
    queryKeys.usage.stats(),
  ],

  // Thread operations - only invalidate thread list and stats
  // Stats are only updated when messages are sent (actual usage), not when threads are created/deleted
  threads: [
    queryKeys.threads.lists(),
    queryKeys.threads.sidebar(),
    queryKeys.usage.stats(), // Invalidate stats to refresh quota
  ],

  threadDetail: (threadId: string) => [
    queryKeys.threads.detail(threadId),
    queryKeys.threads.lists(),
    queryKeys.threads.sidebar(),
    queryKeys.threads.changelog(threadId),
  ],

  // After thread message - invalidate thread detail and usage stats
  afterThreadMessage: (threadId: string) => [
    queryKeys.threads.detail(threadId),
    queryKeys.threads.lists(),
    queryKeys.threads.sidebar(),
    queryKeys.usage.stats(),
  ],

  // Custom role operations
  customRoles: [
    queryKeys.customRoles.lists(),
    queryKeys.usage.stats(),
  ],

  customRoleDetail: (roleId: string) => [
    queryKeys.customRoles.detail(roleId),
    queryKeys.customRoles.lists(),
  ],

  // User preset operations
  userPresets: [
    queryKeys.userPresets.lists(),
  ],

  userPresetDetail: (presetId: string) => [
    queryKeys.userPresets.detail(presetId),
    queryKeys.userPresets.lists(),
  ],

  // API Key operations
  apiKeys: [
    queryKeys.apiKeys.lists(),
  ],

  apiKeyDetail: (keyId: string) => [
    queryKeys.apiKeys.detail(keyId),
    queryKeys.apiKeys.lists(),
  ],

  // Project operations
  projects: [
    queryKeys.projects.lists(),
  ],

  projectDetail: (projectId: string) => [
    queryKeys.projects.detail(projectId),
    queryKeys.projects.lists(),
    queryKeys.projects.attachments(projectId),
    queryKeys.projects.memories(projectId),
  ],

  // Project attachment operations
  projectAttachments: (projectId: string) => [
    queryKeys.projects.attachments(projectId),
    queryKeys.projects.detail(projectId), // Update attachment counts
  ],

  // Project memory operations
  projectMemories: (projectId: string) => [
    queryKeys.projects.memories(projectId),
    queryKeys.projects.detail(projectId),
  ],

  // Upload (attachment) operations
  uploads: [
    queryKeys.uploads.lists(),
  ],

  uploadDetail: (uploadId: string) => [
    queryKeys.uploads.detail(uploadId),
    queryKeys.uploads.lists(),
  ],

  // After upload - invalidate upload list
  afterUpload: () => [
    queryKeys.uploads.lists(),
  ],

  // Leave thread - invalidate thread-specific caches when navigating away
  // Used by navigation-reset.ts when user leaves a thread to start a new chat
  leaveThread: (threadId: string) => [
    queryKeys.threads.messages(threadId),
    queryKeys.threads.preSearches(threadId),
    queryKeys.threads.feedback(threadId),
  ],
} as const;

// ============================================================================
// Billing Invalidation Helpers
// ============================================================================

/**
 * Shared billing invalidation helpers
 *
 * Consolidates the duplicated cache invalidation logic used across:
 * - useSyncAfterCheckoutMutation
 * - useSwitchSubscriptionMutation
 * - useCancelSubscriptionMutation
 * - BillingSuccessClient
 *
 * These mutations all need to:
 * 1. Invalidate subscription queries
 * 2. Bypass HTTP cache for usage stats (quota limits tied to tier)
 * 3. Bypass HTTP cache for models (tier-based access restrictions)
 */
export const billingInvalidationHelpers = {
  /**
   * Invalidate subscription queries after billing changes
   */
  invalidateSubscriptions: (queryClient: QueryClient) => {
    return queryClient.invalidateQueries({
      queryKey: queryKeys.subscriptions.all,
      refetchType: 'all',
    });
  },

  /**
   * Refresh usage stats with HTTP cache bypass
   * Falls back to invalidation if direct fetch fails
   */
  refreshUsageStats: async (queryClient: QueryClient) => {
    try {
      const freshUsageData = await getUserUsageStatsService({ bypassCache: true });
      queryClient.setQueryData(queryKeys.usage.stats(), freshUsageData);
    } catch (error) {
      console.error('[Billing] Failed to refresh usage stats:', error);
      void queryClient.invalidateQueries({ queryKey: queryKeys.usage.all });
    }
  },

  /**
   * Refresh models with HTTP cache bypass
   * Falls back to invalidation if direct fetch fails
   */
  refreshModels: async (queryClient: QueryClient) => {
    try {
      const freshModelsData = await listModelsService({ bypassCache: true });
      queryClient.setQueryData(queryKeys.models.list(), freshModelsData);
    } catch (error) {
      console.error('[Billing] Failed to refresh models:', error);
      void queryClient.invalidateQueries({ queryKey: queryKeys.models.all });
    }
  },

  /**
   * Full billing state refresh after subscription changes
   *
   * Use this after:
   * - Checkout completion (sync)
   * - Plan switch (upgrade/downgrade)
   * - Subscription cancellation
   *
   * Bypasses HTTP cache for usage/models to ensure fresh tier data
   */
  invalidateAfterBillingChange: async (queryClient: QueryClient) => {
    // Invalidate subscriptions first
    billingInvalidationHelpers.invalidateSubscriptions(queryClient);

    // Refresh usage and models in parallel with cache bypass
    await Promise.all([
      billingInvalidationHelpers.refreshUsageStats(queryClient),
      billingInvalidationHelpers.refreshModels(queryClient),
    ]);
  },
} as const;

// ============================================================================
// Query Key Segments - Enum for type-safe key segment checks
// ============================================================================

/**
 * Query key segment values used in infinite query predicates
 * Use these instead of hardcoded string literals
 */
export const QueryKeySegments = {
  LIST: 'list',
  SIDEBAR: 'sidebar',
  DETAIL: 'detail',
} as const;

export type QueryKeySegment = typeof QueryKeySegments[keyof typeof QueryKeySegments];

/**
 * Predicate for checking if a query is a list or sidebar infinite query
 * Used for cache updates in flow-controller and form-actions
 */
export function isListOrSidebarQuery(query: { queryKey: readonly unknown[] }): boolean {
  if (query.queryKey.length < 2)
    return false;
  const key = query.queryKey[1];
  return key === QueryKeySegments.LIST || key === QueryKeySegments.SIDEBAR;
}
