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
  adminJobs: 5 * 1000, // 5 seconds - admin jobs poll frequently for running jobs
  apiKeys: 5 * 60 * 1000, // 5 minutes - API keys rarely created/deleted

  changelog: 30 * 1000, // 30 seconds - configuration changes tracked in real-time
  // ============================================================================
  // Chat Configuration (semi-static)
  // ============================================================================
  chatRoles: 10 * 60 * 1000, // 10 minutes - roles are fairly static
  infinite: Infinity, // Never stale (static data like app config)
  messages: 2 * 60 * 1000, // 2 minutes - messages immutable, new ones added via streaming

  modelDetail: 5 * 60 * 1000, // 5 minutes - individual model details can change
  // ============================================================================
  // AI Models (Aggressive caching: HTTP + KV + client cache)
  // ============================================================================
  models: Infinity, // Never auto-refetch - HTTP cache (1h client, 24h CDN) + manual invalidation on tier changes

  modelsKV: 24 * 3600, // 24 hours KV cache TTL (in seconds for $withCache)
  moderators: 2 * 60 * 1000, // 2 minutes - moderators per round
  // ============================================================================
  // Special Cases
  // ============================================================================
  none: 0, // Force fresh data (e.g., after mutations)
  preSearch: Infinity, // Never stale - ONE-WAY DATA FLOW pattern (same as summaries)
  // ============================================================================
  // Products & Billing
  // ============================================================================
  products: 24 * 3600 * 1000, // 24 hours - matches server unstable_cache duration
  providers: 10 * 60 * 1000, // 10 minutes - provider list changes infrequently
  publicMessagesKV: 3600, // 1 hour - public messages are immutable
  publicSlugsListKV: 3600, // 1 hour - public slugs list for SSG
  publicThreadDetail: 24 * 3600 * 1000, // 24 hours - matches ISR cache (1 day)
  publicThreadKV: 3600, // 1 hour - public thread immutable content
  publicThreadSlugs: 24 * 3600 * 1000, // 24 hours - matches ISR cache (used for SSG)
  quota: 0, // ⚠️ NO CACHE - quota must always be fresh to ensure accurate UI blocking

  subscriptions: 60 * 1000, // 1 minute - matches subscriptionsQueryOptions for SSR hydration
  threadChangelog: Infinity, // Never stale - ONE-WAY DATA FLOW pattern (FLOW_DOCUMENTATION.md:32)
  threadDetail: 0, // NO CACHE - streaming updates require fresh data, store is source of truth (ONE-WAY DATA FLOW)
  threadMetadata: 5 * 60 * 1000, // 5 minutes - thread metadata (title, slug, participants) is stable after creation
  threadDetailKV: 300, // 5 minutes - thread detail DB cache
  // ============================================================================
  // KV Cache TTLs (in seconds for $withCache DB-level caching)
  // ============================================================================
  threadListKV: 120, // 2 minutes - thread list DB cache
  threadMessages: 0, // NO CACHE - messages may be added via streaming, must always be fresh
  threadMessagesKV: 300, // 5 minutes - messages immutable, fast load on nav

  threadModerators: Infinity, // Never stale - ONE-WAY DATA FLOW pattern (FLOW_DOCUMENTATION.md:32)
  threadParticipantsKV: 600, // 10 minutes - participants rarely change
  // ============================================================================
  // Chat & Messages (optimized for navigation speed)
  // ============================================================================
  threads: 60 * 1000, // 1 minute - sidebar list, invalidated on mutations

  threadSidebarKV: 60, // 60s - lightweight sidebar (KV min TTL is 60s)
  threadsSidebar: 30 * 1000, // 30s - lightweight sidebar endpoint, shorter TTL for fresher titles

  // ============================================================================
  // Usage & Quota
  // ============================================================================
  usage: 0, // ⚠️ NO CACHE - usage stats must always be fresh after plan changes and chat operations
  // ============================================================================
  // User & Settings (infrequent changes)
  // ============================================================================
  userProfile: 5 * 60 * 1000, // 5 minutes - user profile rarely changes
} as const;

/**
 * Stale time presets for common use cases
 *
 * Use these when you don't have a specific entry in STALE_TIMES
 */
export const STALE_TIME_PRESETS = {
  /** For data that changes infrequently (e.g., configuration) */
  long: 5 * 60 * 1000, // 5 minutes

  /** For data that changes occasionally (e.g., settings) */
  medium: 2 * 60 * 1000, // 2 minutes

  /** For data that changes frequently (e.g., user activity) */
  short: 30 * 1000, // 30 seconds

  /** For effectively static data (e.g., app constants) */
  static: 24 * 60 * 60 * 1000, // 24 hours

  /** For data that rarely changes (e.g., product catalog) */
  veryLong: 30 * 60 * 1000, // 30 minutes

  /** For data that changes very frequently (e.g., live updates) */
  veryShort: 10 * 1000, // 10 seconds
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
  /** Keep in cache forever - for static data that never changes */
  INFINITE: Infinity,

  /** Long cache time - 10 minutes (for infrequently changing data) */
  LONG: 10 * 60 * 1000,

  /** Short cache time - 1 minute (for frequently changing data) */
  SHORT: 60 * 1000,

  /** Standard cache time - 5 minutes (most queries use this) */
  STANDARD: 5 * 60 * 1000,
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
