/**
 * Centralized Stale Time Configuration
 *
 * CRITICAL: These values MUST be used consistently across server and client
 * to prevent hydration mismatches.
 *
 * Best Practices:
 * - Use the same staleTime in server prefetch and client useQuery
 * - Set staleTime based on how frequently data changes
 * - Longer staleTime = fewer refetches, better performance
 * - Shorter staleTime = fresher data, more API calls
 *
 * Pattern:
 * ```typescript
 * // Server Component
 * await queryClient.prefetchQuery({
 *   queryKey: queryKeys.products.list(),
 *   queryFn: getProductsService,
 *   staleTime: STALE_TIMES.products,
 * });
 *
 * // Client Component
 * useQuery({
 *   queryKey: queryKeys.products.list(),
 *   queryFn: getProductsService,
 *   staleTime: STALE_TIMES.products,
 * });
 * ```
 */

export const STALE_TIMES = {
  // ============================================================================
  // Products & Billing
  // ============================================================================
  products: 24 * 3600 * 1000, // 24 hours - matches server unstable_cache duration
  subscriptions: 60 * 1000, // 1 minute - matches subscriptionsQueryOptions for SSR hydration

  // ============================================================================
  // AI Models (Aggressive caching: HTTP + KV + client cache)
  // ============================================================================
  models: Infinity, // Never auto-refetch - HTTP cache (1h client, 24h CDN) + manual invalidation on tier changes
  modelsKV: 24 * 3600, // 24 hours KV cache TTL (in seconds for $withCache)
  modelDetail: 5 * 60 * 1000, // 5 minutes - individual model details can change
  providers: 10 * 60 * 1000, // 10 minutes - provider list changes infrequently

  // ============================================================================
  // Usage & Quota
  // ============================================================================
  usage: 0, // ⚠️ NO CACHE - usage stats must always be fresh after plan changes and chat operations
  quota: 0, // ⚠️ NO CACHE - quota must always be fresh to ensure accurate UI blocking

  // ============================================================================
  // Chat & Messages (optimized for navigation speed)
  // ============================================================================
  threads: 60 * 1000, // 1 minute - sidebar list, invalidated on mutations
  threadsSidebar: 30 * 1000, // 30s - lightweight sidebar endpoint, shorter TTL for fresher titles
  threadDetail: 0, // NO CACHE - streaming updates require fresh data, store is source of truth (ONE-WAY DATA FLOW)
  threadMessages: 0, // NO CACHE - messages may be added via streaming, must always be fresh
  threadChangelog: Infinity, // Never stale - ONE-WAY DATA FLOW pattern (FLOW_DOCUMENTATION.md:32)
  threadModerators: Infinity, // Never stale - ONE-WAY DATA FLOW pattern (FLOW_DOCUMENTATION.md:32)
  threadFeedback: Infinity, // Never stale - invalidated only on mutation
  moderators: 2 * 60 * 1000, // 2 minutes - moderators per round
  preSearch: Infinity, // Never stale - ONE-WAY DATA FLOW pattern (same as summaries)
  messages: 2 * 60 * 1000, // 2 minutes - messages immutable, new ones added via streaming
  publicThreadDetail: 24 * 3600 * 1000, // 24 hours - matches ISR cache (1 day)
  publicThreadSlugs: 24 * 3600 * 1000, // 24 hours - matches ISR cache (used for SSG)

  // ============================================================================
  // KV Cache TTLs (in seconds for $withCache DB-level caching)
  // ============================================================================
  threadListKV: 120, // 2 minutes - thread list DB cache
  threadSidebarKV: 60, // 60s - lightweight sidebar (KV min TTL is 60s)
  threadDetailKV: 300, // 5 minutes - thread detail DB cache
  threadMessagesKV: 300, // 5 minutes - messages immutable, fast load on nav
  threadParticipantsKV: 600, // 10 minutes - participants rarely change
  publicThreadKV: 3600, // 1 hour - public thread immutable content
  publicMessagesKV: 3600, // 1 hour - public messages are immutable
  publicSlugsListKV: 3600, // 1 hour - public slugs list for SSG

  // ============================================================================
  // User & Settings (infrequent changes)
  // ============================================================================
  userProfile: 5 * 60 * 1000, // 5 minutes - user profile rarely changes
  apiKeys: 5 * 60 * 1000, // 5 minutes - API keys rarely created/deleted
  adminJobs: 5 * 1000, // 5 seconds - admin jobs poll frequently for running jobs

  // ============================================================================
  // Chat Configuration (semi-static)
  // ============================================================================
  chatRoles: 10 * 60 * 1000, // 10 minutes - roles are fairly static
  changelog: 30 * 1000, // 30 seconds - configuration changes tracked in real-time

  // ============================================================================
  // Special Cases
  // ============================================================================
  none: 0, // Force fresh data (e.g., after mutations)
  infinite: Infinity, // Never stale (static data like app config)
} as const;

/**
 * Stale time presets for common use cases
 *
 * Use these when you don't have a specific entry in STALE_TIMES
 */
export const STALE_TIME_PRESETS = {
  /** For data that changes very frequently (e.g., live updates) */
  veryShort: 10 * 1000, // 10 seconds

  /** For data that changes frequently (e.g., user activity) */
  short: 30 * 1000, // 30 seconds

  /** For data that changes occasionally (e.g., settings) */
  medium: 2 * 60 * 1000, // 2 minutes

  /** For data that changes infrequently (e.g., configuration) */
  long: 5 * 60 * 1000, // 5 minutes

  /** For data that rarely changes (e.g., product catalog) */
  veryLong: 30 * 60 * 1000, // 30 minutes

  /** For effectively static data (e.g., app constants) */
  static: 24 * 60 * 60 * 1000, // 24 hours
} as const;

/**
 * Helper to get stale time by key with fallback
 */
export function getStaleTime(
  key: keyof typeof STALE_TIMES,
  fallback = STALE_TIME_PRESETS.medium,
): number {
  return STALE_TIMES[key] ?? fallback;
}

/**
 * Type-safe stale time configuration
 * Ensures consistency between server and client
 */
export type StaleTimeKey = keyof typeof STALE_TIMES;

// ============================================================================
// GC (GARBAGE COLLECTION) TIMES
// ============================================================================

/**
 * Centralized gcTime configuration
 *
 * gcTime controls how long inactive query data is kept in cache before garbage collection.
 * Use these constants instead of hardcoded values for consistency.
 *
 * Pattern:
 * ```typescript
 * useQuery({
 *   queryKey: queryKeys.products.list(),
 *   queryFn: getProductsService,
 *   staleTime: STALE_TIMES.products,
 *   gcTime: GC_TIMES.STANDARD, // 5 minutes
 * });
 * ```
 */
export const GC_TIMES = {
  /** Standard cache time - 5 minutes (most queries use this) */
  STANDARD: 5 * 60 * 1000,

  /** Keep in cache forever - for static data that never changes */
  INFINITE: Infinity,

  /** Short cache time - 1 minute (for frequently changing data) */
  SHORT: 60 * 1000,

  /** Long cache time - 10 minutes (for infrequently changing data) */
  LONG: 10 * 60 * 1000,
} as const;

// ============================================================================
// POLLING INTERVALS
// ============================================================================

/**
 * Centralized polling interval configuration
 *
 * Used by TanStack Query's refetchInterval option for conditional polling.
 * These are used when polling is needed to detect state transitions.
 */
export const POLLING_INTERVALS = {
  /** Poll for pre-search status changes (PENDING -> STREAMING transition) */
  preSearchPending: 500,
  /** Poll for AI-generated title/slug status during thread creation */
  slugStatus: 2_000,
} as const;
