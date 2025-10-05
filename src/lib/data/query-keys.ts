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
    threadQuota: () => QueryKeyFactory.action('usage', 'quota', 'threads'),
    messageQuota: () => QueryKeyFactory.action('usage', 'quota', 'messages'),
  },

  // Chat Threads
  threads: {
    all: QueryKeyFactory.base('threads'),
    lists: () => [...queryKeys.threads.all, 'list'] as const,
    list: (cursor?: string) =>
      cursor
        ? QueryKeyFactory.action('threads', 'list', cursor)
        : QueryKeyFactory.list('threads'),
    details: () => [...queryKeys.threads.all, 'detail'] as const,
    detail: (id: string) => QueryKeyFactory.detail('threads', id),
    public: (slug: string) => QueryKeyFactory.action('threads', 'public', slug),
    bySlug: (slug: string) => QueryKeyFactory.action('threads', 'slug', slug),
  },

  // Chat Memories
  memories: {
    all: QueryKeyFactory.base('memories'),
    lists: () => [...queryKeys.memories.all, 'list'] as const,
    list: (cursor?: string) =>
      cursor
        ? QueryKeyFactory.action('memories', 'list', cursor)
        : QueryKeyFactory.list('memories'),
    details: () => [...queryKeys.memories.all, 'detail'] as const,
    detail: (id: string) => QueryKeyFactory.detail('memories', id),
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
  subscriptions: [
    queryKeys.subscriptions.lists(),
    queryKeys.subscriptions.current(),
  ],

  subscriptionDetail: (subscriptionId: string) => [
    queryKeys.subscriptions.detail(subscriptionId),
    queryKeys.subscriptions.lists(),
    queryKeys.subscriptions.current(),
  ],

  // After checkout - invalidate everything billing related
  afterCheckout: [
    queryKeys.subscriptions.all,
    queryKeys.products.all,
  ],

  // Usage operations - invalidate after chat operations
  usage: [
    queryKeys.usage.stats(),
    queryKeys.usage.quotas(),
  ],

  // After chat operations - invalidate usage stats
  afterChatOperation: [
    queryKeys.usage.stats(),
    queryKeys.usage.threadQuota(),
    queryKeys.usage.messageQuota(),
  ],

  // Thread operations
  threads: [
    queryKeys.threads.lists(),
    queryKeys.usage.stats(),
    queryKeys.usage.threadQuota(),
  ],

  threadDetail: (threadId: string) => [
    queryKeys.threads.detail(threadId),
    queryKeys.threads.lists(),
  ],

  // After thread message - invalidate thread detail and usage
  afterThreadMessage: (threadId: string) => [
    queryKeys.threads.detail(threadId),
    queryKeys.threads.lists(),
    queryKeys.usage.stats(),
    queryKeys.usage.messageQuota(),
  ],

  // Memory operations
  memories: [
    queryKeys.memories.lists(),
    queryKeys.usage.stats(),
  ],

  memoryDetail: (memoryId: string) => [
    queryKeys.memories.detail(memoryId),
    queryKeys.memories.lists(),
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
} as const;
