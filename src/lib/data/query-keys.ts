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
    queryKeys.usage.stats(), // Invalidate stats to refresh quota
  ],

  threadDetail: (threadId: string) => [
    queryKeys.threads.detail(threadId),
    queryKeys.threads.lists(),
    queryKeys.threads.changelog(threadId),
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
} as const;
