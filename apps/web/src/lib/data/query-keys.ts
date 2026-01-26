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
  action: (resource: string, action: string, ...params: string[]) =>
    [resource, action, ...params] as const,
  all: (resource: string) => [resource, 'all'] as const,
  base: (resource: string) => [resource] as const,
  current: (resource: string) => [resource, 'current'] as const,
  detail: (resource: string, id: string) => [resource, 'detail', id] as const,
  list: (resource: string) => [resource, 'list'] as const,
} as const;

/**
 * Billing domain query keys
 */
export const queryKeys = {
  // Admin: Automated Jobs
  adminJobs: {
    all: QueryKeyFactory.base('adminJobs'),
    detail: (id: string) => QueryKeyFactory.detail('adminJobs', id),
    details: () => [...queryKeys.adminJobs.all, 'detail'] as const,
    list: (status?: string) =>
      status
        ? QueryKeyFactory.action('adminJobs', 'list', status)
        : QueryKeyFactory.list('adminJobs'),
    lists: () => [...queryKeys.adminJobs.all, 'list'] as const,
  },

  // API Keys
  apiKeys: {
    all: QueryKeyFactory.base('apiKeys'),
    detail: (id: string) => QueryKeyFactory.detail('apiKeys', id),
    details: () => [...queryKeys.apiKeys.all, 'detail'] as const,
    list: () => QueryKeyFactory.list('apiKeys'),
    lists: () => [...queryKeys.apiKeys.all, 'list'] as const,
  },

  // Checkout
  checkout: {
    all: QueryKeyFactory.base('checkout'),
    session: (sessionId: string) => QueryKeyFactory.action('checkout', 'session', sessionId),
  },

  // Chat Custom Roles
  customRoles: {
    all: QueryKeyFactory.base('customRoles'),
    detail: (id: string) => QueryKeyFactory.detail('customRoles', id),
    details: () => [...queryKeys.customRoles.all, 'detail'] as const,
    list: (cursor?: string) =>
      cursor
        ? QueryKeyFactory.action('customRoles', 'list', cursor)
        : QueryKeyFactory.list('customRoles'),
    lists: () => [...queryKeys.customRoles.all, 'list'] as const,
  },

  // OpenRouter Models
  models: {
    all: QueryKeyFactory.base('models'),
    list: () => QueryKeyFactory.list('models'),
  },

  // Products
  products: {
    all: QueryKeyFactory.base('products'),
    detail: (id: string) => QueryKeyFactory.detail('products', id),
    details: () => [...queryKeys.products.all, 'detail'] as const,
    list: () => QueryKeyFactory.list('products'),
    lists: () => [...queryKeys.products.all, 'list'] as const,
  },

  // Projects
  projects: {
    all: QueryKeyFactory.base('projects'),
    attachments: (id: string) => QueryKeyFactory.action('projects', 'attachments', id),
    context: (id: string) => QueryKeyFactory.action('projects', 'context', id),
    detail: (id: string) => QueryKeyFactory.detail('projects', id),
    details: () => [...queryKeys.projects.all, 'detail'] as const,
    limits: () => QueryKeyFactory.action('projects', 'limits'),
    list: (cursor?: string) =>
      cursor
        ? QueryKeyFactory.action('projects', 'list', cursor)
        : QueryKeyFactory.list('projects'),
    lists: (search?: string) =>
      search
        ? [...queryKeys.projects.all, 'list', 'search', search] as const
        : [...queryKeys.projects.all, 'list'] as const,
    memories: (id: string) => QueryKeyFactory.action('projects', 'memories', id),
    sidebar: () => [...queryKeys.projects.all, 'sidebar'] as const,
    /**
     * Project threads query key - matches projectThreadsQueryOptions pattern
     * Key format: ['threads', 'list', { search: undefined, projectId }]
     * This ensures invalidation hits the actual cached query
     */
    threads: (id: string) => ['threads', 'list', { projectId: id, search: undefined }] as const,
  },

  // Session (auth state)
  session: {
    all: QueryKeyFactory.base('session'),
    current: () => QueryKeyFactory.current('session'),
  },

  // Subscriptions
  subscriptions: {
    all: QueryKeyFactory.base('subscriptions'),
    current: () => QueryKeyFactory.current('subscriptions'),
    detail: (id: string) => QueryKeyFactory.detail('subscriptions', id),
    details: () => [...queryKeys.subscriptions.all, 'detail'] as const,
    list: () => QueryKeyFactory.list('subscriptions'),
    lists: () => [...queryKeys.subscriptions.all, 'list'] as const,
  },

  // Chat Threads
  threads: {
    all: QueryKeyFactory.base('threads'),
    bySlug: (slug: string) => QueryKeyFactory.action('threads', 'slug', slug),
    changelog: (id: string) => QueryKeyFactory.action('threads', 'changelog', id),
    detail: (id: string) => QueryKeyFactory.detail('threads', id),
    details: () => [...queryKeys.threads.all, 'detail'] as const,
    feedback: (id: string) => QueryKeyFactory.action('threads', 'feedback', id),
    list: (cursor?: string) =>
      cursor
        ? QueryKeyFactory.action('threads', 'list', cursor)
        : QueryKeyFactory.list('threads'),
    lists: (search?: string) =>
      search
        ? [...queryKeys.threads.all, 'list', 'search', search] as const
        : [...queryKeys.threads.all, 'list'] as const,
    memoryEvents: (threadId: string, roundNumber: number) =>
      QueryKeyFactory.action('threads', 'memory-events', threadId, String(roundNumber)),
    messages: (id: string) => QueryKeyFactory.action('threads', 'messages', id),
    preSearches: (id: string) => QueryKeyFactory.action('threads', 'pre-searches', id),
    public: (slug: string) => QueryKeyFactory.action('threads', 'public', slug),
    publicSlugs: () => QueryKeyFactory.action('threads', 'public', 'slugs'),
    roundChangelog: (id: string, roundNumber: number) =>
      QueryKeyFactory.action('threads', 'changelog', id, 'round', String(roundNumber)),
    sidebar: (search?: string) =>
      search
        ? [...queryKeys.threads.all, 'sidebar', 'search', search] as const
        : [...queryKeys.threads.all, 'sidebar'] as const,
    slugStatus: (id: string) => QueryKeyFactory.action('threads', 'slug-status', id),
    streamResumption: (id: string) => QueryKeyFactory.action('threads', 'stream-resumption', id),
  },

  // Uploads (Centralized file storage)
  // Note: Thread/message associations are via junction tables, not direct queries
  uploads: {
    all: QueryKeyFactory.base('uploads'),
    detail: (id: string) => QueryKeyFactory.detail('uploads', id),
    details: () => [...queryKeys.uploads.all, 'detail'] as const,
    downloadUrl: (id: string) => QueryKeyFactory.action('uploads', 'downloadUrl', id),
    list: (cursor?: string) =>
      cursor
        ? QueryKeyFactory.action('uploads', 'list', cursor)
        : QueryKeyFactory.list('uploads'),
    lists: () => [...queryKeys.uploads.all, 'list'] as const,
  },

  // Usage Tracking
  usage: {
    all: QueryKeyFactory.base('usage'),
    quotas: () => [...queryKeys.usage.all, 'quotas'] as const,
    stats: () => QueryKeyFactory.action('usage', 'stats'),
  },

  // User Presets (saved model+role configurations)
  userPresets: {
    all: QueryKeyFactory.base('userPresets'),
    detail: (id: string) => QueryKeyFactory.detail('userPresets', id),
    details: () => [...queryKeys.userPresets.all, 'detail'] as const,
    list: (cursor?: string) =>
      cursor
        ? QueryKeyFactory.action('userPresets', 'list', cursor)
        : QueryKeyFactory.list('userPresets'),
    lists: () => [...queryKeys.userPresets.all, 'list'] as const,
  },
} as const;

/**
 * Invalidation patterns for common operations
 * Use these to invalidate related queries after mutations
 *
 * IMPORTANT: Always use these patterns instead of direct invalidateQueries calls
 * This ensures consistent cache behavior across the app
 */
export const invalidationPatterns = {
  // ============================================================================
  // Admin Operations
  // ============================================================================

  adminJobDetail: (jobId: string) => [
    queryKeys.adminJobs.detail(jobId),
    queryKeys.adminJobs.lists(),
  ],

  adminJobs: [
    queryKeys.adminJobs.lists(),
  ],

  // ============================================================================
  // API Key Operations
  // ============================================================================

  apiKeyDetail: (keyId: string) => [
    queryKeys.apiKeys.detail(keyId),
    queryKeys.apiKeys.lists(),
  ],

  apiKeys: [
    queryKeys.apiKeys.all,
  ],

  // ============================================================================
  // Billing & Subscription Operations
  // ============================================================================

  /** After checkout session creation - prepare for post-checkout data */
  checkoutSession: [
    queryKeys.subscriptions.all,
    queryKeys.usage.all,
  ],

  /** After successful checkout sync - full billing state refresh */
  afterCheckout: [
    queryKeys.subscriptions.all,
    queryKeys.products.all,
    queryKeys.usage.all,
    queryKeys.models.all,
  ],

  /** After subscription change (switch/cancel) - same as afterCheckout */
  subscriptionChange: [
    queryKeys.subscriptions.all,
    queryKeys.products.all,
    queryKeys.usage.all,
    queryKeys.models.all,
  ],

  // ============================================================================
  // Custom Role Operations
  // ============================================================================

  customRoleDetail: (roleId: string) => [
    queryKeys.customRoles.detail(roleId),
    queryKeys.customRoles.lists(),
    queryKeys.userPresets.all, // Presets reference roles
  ],

  customRoles: [
    queryKeys.customRoles.lists(),
    queryKeys.usage.stats(),
    queryKeys.userPresets.all, // Presets reference roles and become stale when roles change
  ],

  // ============================================================================
  // Thread & Chat Operations
  // ============================================================================

  /** After chat operations - invalidate usage stats */
  afterChatOperation: [
    queryKeys.usage.stats(),
  ],

  /** After thread message - invalidate thread detail and usage stats */
  afterThreadMessage: (threadId: string) => [
    queryKeys.threads.detail(threadId),
    queryKeys.threads.lists(),
    queryKeys.threads.sidebar(),
    queryKeys.usage.stats(),
  ],

  // ============================================================================
  // Upload Operations
  // ============================================================================

  /** After upload completion - invalidate upload list */
  afterUpload: () => [
    queryKeys.uploads.lists(),
  ],

  /** After any upload mutation (complete, abort, delete) */
  uploads: [
    queryKeys.uploads.all,
  ],

  // Leave thread - invalidate auxiliary thread-specific caches when navigating away
  // NOTE: We do NOT invalidate bySlug() or detail() - those should stay cached for snappy navigation
  // Only invalidate ephemeral data that shouldn't persist across sessions
  leaveThread: (threadId: string) => [
    queryKeys.threads.streamResumption(threadId), // Ephemeral streaming state
  ],

  productDetail: (productId: string) => [
    queryKeys.products.detail(productId),
    queryKeys.products.lists(),
  ],

  // Product operations
  products: [queryKeys.products.all],

  // Project attachment operations
  projectAttachments: (projectId: string) => [
    queryKeys.projects.attachments(projectId),
    queryKeys.projects.detail(projectId), // Update attachment counts
  ],

  projectDetail: (projectId: string) => [
    queryKeys.projects.detail(projectId),
    queryKeys.projects.lists(),
    queryKeys.projects.sidebar(),
    queryKeys.projects.attachments(projectId),
    queryKeys.projects.memories(projectId),
  ],

  // Project memory operations
  projectMemories: (projectId: string) => [
    queryKeys.projects.memories(projectId),
    queryKeys.projects.detail(projectId),
  ],

  // Project operations
  projects: [
    queryKeys.projects.lists(),
    queryKeys.projects.sidebar(),
    queryKeys.projects.limits(),
  ],

  // Project thread operations - invalidate threads list and project detail
  projectThreads: (projectId: string) => [
    queryKeys.projects.threads(projectId),
    queryKeys.projects.detail(projectId), // Update thread counts
    queryKeys.projects.sidebar(), // Update sidebar thread counts
  ],

  // Auth state change - invalidate ALL user-specific data
  // Used on logout, impersonation start/stop to ensure fresh data
  sessionChange: [
    queryKeys.threads.all,
    queryKeys.subscriptions.all,
    queryKeys.usage.all,
    queryKeys.models.all,
    queryKeys.customRoles.all,
    queryKeys.userPresets.all,
    queryKeys.apiKeys.all,
    queryKeys.projects.all,
    queryKeys.uploads.all,
    queryKeys.adminJobs.all,
  ],

  subscriptionDetail: (subscriptionId: string) => [
    queryKeys.subscriptions.detail(subscriptionId),
    queryKeys.subscriptions.lists(),
    queryKeys.subscriptions.current(),
    queryKeys.usage.all,
    queryKeys.models.all,
  ],

  // Subscription operations
  // IMPORTANT: Always invalidate usage queries with subscriptions since quotas are tied to subscription tier
  subscriptions: [
    queryKeys.subscriptions.lists(),
    queryKeys.subscriptions.current(),
    queryKeys.usage.all,
    queryKeys.models.all,
  ],

  threadDetail: (threadId: string) => [
    queryKeys.threads.detail(threadId),
    queryKeys.threads.lists(),
    queryKeys.threads.sidebar(),
    queryKeys.threads.changelog(threadId),
  ],

  // Thread operations - only invalidate thread list and stats
  // Stats are only updated when messages are sent (actual usage), not when threads are created/deleted
  threads: [
    queryKeys.threads.lists(),
    queryKeys.threads.sidebar(),
    queryKeys.usage.stats(), // Invalidate stats to refresh quota
  ],

  uploadDetail: (uploadId: string) => [
    queryKeys.uploads.detail(uploadId),
    queryKeys.uploads.lists(),
  ],

  // Usage operations - invalidate after chat operations
  usage: [
    queryKeys.usage.stats(),
    queryKeys.usage.quotas(),
  ],

  userPresetDetail: (presetId: string) => [
    queryKeys.userPresets.detail(presetId),
    queryKeys.userPresets.lists(),
  ],

  // User preset operations
  userPresets: [
    queryKeys.userPresets.lists(),
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
} as const;

// ============================================================================
// Query Key Segments - Enum for type-safe key segment checks
// ============================================================================

/**
 * Query key segment values used in infinite query predicates
 * Use these instead of hardcoded string literals
 */
export const QueryKeySegments = {
  DETAIL: 'detail',
  LIST: 'list',
  SIDEBAR: 'sidebar',
} as const;

export type QueryKeySegment = typeof QueryKeySegments[keyof typeof QueryKeySegments];

/**
 * Predicate for checking if a query is a list or sidebar infinite query
 * Used for cache updates in flow-controller and form-actions
 */
export function isListOrSidebarQuery(query: { queryKey: readonly unknown[] }): boolean {
  if (query.queryKey.length < 2) {
    return false;
  }
  const key = query.queryKey[1];
  return key === QueryKeySegments.LIST || key === QueryKeySegments.SIDEBAR;
}

/**
 * Predicate for list/sidebar queries WITHOUT a projectId
 * Prevents new standalone threads from being added to project-specific caches
 */
export function isNonProjectListOrSidebarQuery(query: { queryKey: readonly unknown[] }): boolean {
  if (!isListOrSidebarQuery(query)) {
    return false;
  }
  // Check if query has a projectId in its params (3rd element)
  const params = query.queryKey[2] as { projectId?: string } | undefined;
  return !params?.projectId;
}
