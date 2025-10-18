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
  // Products & Billing (rarely change)
  // ============================================================================
  products: 3600 * 1000, // 1 hour - products rarely change
  subscriptions: 2 * 60 * 1000, // 2 minutes - subscription status changes occasionally

  // ============================================================================
  // AI Models (cached on server for 24h, client uses server cache)
  // ============================================================================
  models: Infinity, // Never refetch on client - server cache is 24h, models rarely change
  modelDetail: 5 * 60 * 1000, // 5 minutes - individual model details can change
  providers: 10 * 60 * 1000, // 10 minutes - provider list changes infrequently

  // ============================================================================
  // Usage & Quota (change frequently)
  // ============================================================================
  usage: 60 * 1000, // 1 minute - usage stats update frequently
  quota: 60 * 1000, // 1 minute - quota limits tied to subscription

  // ============================================================================
  // Chat & Messages (real-time data)
  // ============================================================================
  threads: 30 * 1000, // 30 seconds - threads list updated when new thread created
  threadDetail: 10 * 1000, // 10 seconds - thread detail refreshed on each visit
  threadMessages: 5 * 1000, // 5 seconds - messages added in real-time
  threadChangelog: 30 * 1000, // 30 seconds - configuration changes
  threadAnalyses: 60 * 1000, // 1 minute - moderator analyses
  messages: 10 * 1000, // 10 seconds - messages can be added in real-time
  publicThreadDetail: 5 * 60 * 1000, // 5 minutes - public threads change less frequently

  // ============================================================================
  // User & Settings (infrequent changes)
  // ============================================================================
  userProfile: 5 * 60 * 1000, // 5 minutes - user profile rarely changes
  apiKeys: 5 * 60 * 1000, // 5 minutes - API keys rarely created/deleted

  // ============================================================================
  // Chat Configuration (semi-static)
  // ============================================================================
  chatRoles: 10 * 60 * 1000, // 10 minutes - roles are fairly static
  changelog: 30 * 1000, // 30 seconds - configuration changes tracked in real-time
  analyses: 30 * 1000, // 30 seconds - moderator analyses update per round

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
