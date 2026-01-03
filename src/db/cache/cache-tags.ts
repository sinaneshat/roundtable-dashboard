/**
 * Cache Tags - Single Source of Truth
 *
 * Centralized cache tag management for Drizzle ORM + Cloudflare KV caching.
 * All cache tags MUST be defined here to ensure consistency across the codebase.
 *
 * ✅ BENEFITS:
 * - Single source of truth for all cache tags
 * - Type-safe tag generation
 * - Prevents typos and inconsistencies
 * - Easy to find all cache invalidation points
 * - Helper functions for bulk invalidation
 *
 * ❌ DO NOT:
 * - Hardcode cache tags in service files
 * - Create duplicate tag patterns
 * - Use different naming conventions
 *
 * @see src/db/cache/cloudflare-kv-cache.ts for cache implementation
 * @see src/db/index.ts for cache configuration
 */

// ============================================================================
// Static Cache Tags (Global, not entity-specific)
// ============================================================================

/**
 * Static cache tags that apply globally or to collections
 */
export const STATIC_CACHE_TAGS = {
  /** All active Stripe products (billing page) */
  ACTIVE_PRODUCTS: 'active-products',
  /** All active Stripe prices (billing page) */
  ACTIVE_PRICES: 'active-prices',
} as const;

// ============================================================================
// Dynamic Cache Tag Factories (Entity-specific)
// ============================================================================

/**
 * User-related cache tags
 * Used for user data, tier, and usage tracking
 */
export const UserCacheTags = {
  /**
   * User's subscription tier (free/pro)
   * TTL: 5 minutes
   * @example 'user-tier-80e42802-3507-43c4-88a3-c194909b2e4e'
   */
  tier: (userId: string) => `user-tier-${userId}`,

  /**
   * User's usage statistics (threads, messages, custom roles)
   * TTL: 1 minute
   * @example 'user-usage-80e42802-3507-43c4-88a3-c194909b2e4e'
   */
  usage: (userId: string) => `user-usage-${userId}`,

  /**
   * User record data
   * TTL: 5 minutes
   * @example 'user-80e42802-3507-43c4-88a3-c194909b2e4e'
   */
  record: (userId: string) => `user-${userId}`,

  /**
   * Get all user-related cache tags for bulk invalidation
   * @example ['user-tier-...', 'user-usage-...', 'user-...']
   */
  all: (userId: string) => [
    UserCacheTags.tier(userId),
    UserCacheTags.usage(userId),
    UserCacheTags.record(userId),
  ],
} as const;

/**
 * Stripe customer-related cache tags
 */
export const CustomerCacheTags = {
  /**
   * Stripe customer record by user ID
   * TTL: 5 minutes
   * @example 'customer-80e42802-3507-43c4-88a3-c194909b2e4e'
   */
  byUserId: (userId: string) => `customer-${userId}`,

  /**
   * Stripe customer record by customer ID
   * TTL: 5 minutes
   * @example 'customer-id-cus_123abc'
   */
  byCustomerId: (customerId: string) => `customer-id-${customerId}`,

  /**
   * Get all customer-related cache tags for bulk invalidation
   * @example ['customer-...', 'customer-id-...']
   */
  all: (userId: string, customerId?: string) => {
    const tags = [CustomerCacheTags.byUserId(userId)];
    if (customerId) {
      tags.push(CustomerCacheTags.byCustomerId(customerId));
    }
    return tags;
  },
} as const;

/**
 * Stripe subscription-related cache tags
 */
export const SubscriptionCacheTags = {
  /**
   * Active subscription for a user
   * TTL: 2 minutes
   * @example 'active-subscription-80e42802-3507-43c4-88a3-c194909b2e4e'
   */
  active: (userId: string) => `active-subscription-${userId}`,

  /**
   * Get all subscription-related cache tags for bulk invalidation
   * @example ['active-subscription-...']
   */
  all: (userId: string) => [SubscriptionCacheTags.active(userId)],
} as const;

/**
 * Stripe price-related cache tags
 */
export const PriceCacheTags = {
  /**
   * Single price record
   * TTL: 5 minutes
   * @example 'price-price_123abc'
   */
  single: (priceId: string) => `price-${priceId}`,

  /**
   * All prices for a product
   * TTL: 10 minutes
   * @example 'product-prices-prod_123abc'
   */
  byProduct: (productId: string) => `product-prices-${productId}`,

  /**
   * Get all price-related cache tags for bulk invalidation
   * @example ['price-...', 'product-prices-...', 'active-prices']
   */
  all: (priceId: string, productId?: string) => {
    const tags = [PriceCacheTags.single(priceId), STATIC_CACHE_TAGS.ACTIVE_PRICES];
    if (productId) {
      tags.push(PriceCacheTags.byProduct(productId));
    }
    return tags;
  },
} as const;

/**
 * Stripe product-related cache tags
 */
export const ProductCacheTags = {
  /**
   * Single product record
   * TTL: 10 minutes
   * @example 'product-prod_123abc'
   */
  single: (productId: string) => `product-${productId}`,

  /**
   * Get all product-related cache tags for bulk invalidation
   * @example ['product-...', 'active-products']
   */
  all: (productId: string) => [
    ProductCacheTags.single(productId),
    STATIC_CACHE_TAGS.ACTIVE_PRODUCTS,
  ],
} as const;

/**
 * Credit-related cache tags
 */
export const CreditCacheTags = {
  /**
   * Card connection check for a user (immutable once connected)
   * TTL: 1 hour (card connection is one-time event)
   * @example 'card-connection-80e42802-3507-43c4-88a3-c194909b2e4e'
   */
  cardConnection: (userId: string) => `card-connection-${userId}`,

  /**
   * Get all credit-related cache tags for bulk invalidation
   */
  all: (userId: string) => [CreditCacheTags.cardConnection(userId)],
} as const;

/**
 * Chat thread-related cache tags
 */
export const ThreadCacheTags = {
  /**
   * Thread list for a user (sidebar, search)
   * TTL: 30 seconds (quick updates for real-time feel)
   * @example 'threads-list-80e42802-3507-43c4-88a3-c194909b2e4e'
   */
  list: (userId: string) => `threads-list-${userId}`,

  /**
   * Single thread record
   * TTL: 10 seconds (quick updates for active collaboration)
   * @example 'thread-01JHJZ8X9Z3Q7W5KFDNMH3R4QV'
   */
  single: (threadId: string) => `thread-${threadId}`,

  /**
   * Thread by slug (for URL access)
   * TTL: 10 seconds
   * @example 'thread-slug-implement-auth-flow-xyz123'
   */
  bySlug: (slug: string) => `thread-slug-${slug}`,

  /**
   * Thread participants
   * TTL: 10 seconds
   * @example 'thread-participants-01JHJZ8X9Z3Q7W5KFDNMH3R4QV'
   */
  participants: (threadId: string) => `thread-participants-${threadId}`,

  /**
   * Get all thread-related cache tags for bulk invalidation
   * @example ['threads-list-...', 'thread-...', 'thread-participants-...']
   */
  all: (userId: string, threadId?: string, slug?: string) => {
    const tags = [ThreadCacheTags.list(userId)];
    if (threadId) {
      tags.push(
        ThreadCacheTags.single(threadId),
        ThreadCacheTags.participants(threadId),
      );
    }
    if (slug) {
      tags.push(ThreadCacheTags.bySlug(slug));
    }
    return tags;
  },
} as const;

// ============================================================================
// Bulk Cache Invalidation Helpers
// ============================================================================

/**
 * Get all cache tags related to a user's subscription and usage
 * Use this when a subscription is created, updated, or canceled
 *
 * @param userId - User ID
 * @param customerId - Optional Stripe customer ID
 * @param priceId - Optional Stripe price ID
 * @returns Array of all related cache tags
 *
 * @example
 * ```ts
 * const tags = getUserSubscriptionCacheTags(userId, customerId, priceId);
 * await db.$cache.invalidate({ tags });
 * ```
 */
export function getUserSubscriptionCacheTags(
  userId: string,
  customerId?: string,
  priceId?: string,
): string[] {
  const tags = [
    ...UserCacheTags.all(userId),
    ...SubscriptionCacheTags.all(userId),
    ...CustomerCacheTags.all(userId, customerId),
  ];

  if (priceId) {
    tags.push(PriceCacheTags.single(priceId));
  }

  return tags;
}

/**
 * Get all cache tags related to billing data (products and prices)
 * Use this when Stripe products or prices are synced
 *
 * @param productId - Optional product ID
 * @param priceId - Optional price ID
 * @returns Array of all related cache tags
 *
 * @example
 * ```ts
 * const tags = getBillingDataCacheTags(productId, priceId);
 * await db.$cache.invalidate({ tags });
 * ```
 */
export function getBillingDataCacheTags(productId?: string, priceId?: string): string[] {
  const tags: string[] = [STATIC_CACHE_TAGS.ACTIVE_PRODUCTS, STATIC_CACHE_TAGS.ACTIVE_PRICES];

  if (productId) {
    tags.push(...ProductCacheTags.all(productId));
  }

  if (priceId) {
    tags.push(PriceCacheTags.single(priceId));
    if (productId) {
      tags.push(PriceCacheTags.byProduct(productId));
    }
  }

  return tags;
}
