/**
 * Query Key Factory System
 *
 * Centralized query key generation for TanStack Query
 * Ensures consistency between server prefetch and client queries
 * Prevents cache mismatches and enables hierarchical invalidation
 */

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
    details: () => [...queryKeys.threads.all, 'detail'] as const,
    detail: (id: string) => QueryKeyFactory.detail('threads', id),
    public: (slug: string) => QueryKeyFactory.action('threads', 'public', slug),
    bySlug: (slug: string) => QueryKeyFactory.action('threads', 'slug', slug),
    slugStatus: (id: string) => QueryKeyFactory.action('threads', 'slug-status', id),
    messages: (id: string) => QueryKeyFactory.action('threads', 'messages', id),
    changelog: (id: string) => QueryKeyFactory.action('threads', 'changelog', id),
    analyses: (id: string) => QueryKeyFactory.action('threads', 'analyses', id),
    // ❌ REMOVED: preSearch (single round) - frontend uses preSearches (list) via orchestrator
    preSearches: (id: string) => QueryKeyFactory.action('threads', 'pre-searches', id),
    feedback: (id: string) => QueryKeyFactory.action('threads', 'feedback', id),
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
    knowledgeFiles: (id: string) => QueryKeyFactory.action('projects', 'knowledge', id),
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
  // IMPORTANT: Always invalidate models query since model access is tier-based
  subscriptions: [
    queryKeys.subscriptions.lists(),
    queryKeys.subscriptions.current(),
    queryKeys.usage.all,
    queryKeys.models.all, // ✅ FIX: Invalidate models when subscription changes (tier-based access)
  ],

  subscriptionDetail: (subscriptionId: string) => [
    queryKeys.subscriptions.detail(subscriptionId),
    queryKeys.subscriptions.lists(),
    queryKeys.subscriptions.current(),
    queryKeys.usage.all,
    queryKeys.models.all, // ✅ FIX: Invalidate models when subscription changes (tier-based access)
  ],

  // After checkout - invalidate everything billing related including usage/quotas/models
  afterCheckout: [
    queryKeys.subscriptions.all,
    queryKeys.products.all,
    queryKeys.usage.all,
    queryKeys.models.all, // ✅ FIX: Invalidate models after checkout (tier-based access)
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
    queryKeys.usage.stats(), // Invalidate stats to refresh quota
  ],

  threadDetail: (threadId: string) => [
    queryKeys.threads.detail(threadId),
    queryKeys.threads.lists(),
    queryKeys.threads.changelog(threadId), // ✅ Invalidate changelog when thread details change
    // ❌ REMOVED: Don't invalidate analyses when thread details change
    // Analyses are tied to specific rounds and don't change when participants/mode are updated
    // Analyses are only invalidated when:
    // 1. onRoundComplete callback (creates new pending analysis)
    // 2. onStreamComplete callback (analysis finishes streaming)
    // queryKeys.threads.analyses(threadId),
  ],

  // After thread message - invalidate thread detail and usage stats
  afterThreadMessage: (threadId: string) => [
    queryKeys.threads.detail(threadId),
    queryKeys.threads.lists(),
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
    queryKeys.projects.knowledgeFiles(projectId),
  ],

  // Knowledge file operations
  knowledgeFiles: (projectId: string) => [
    queryKeys.projects.knowledgeFiles(projectId),
    queryKeys.projects.detail(projectId), // Update file counts
  ],
} as const;
