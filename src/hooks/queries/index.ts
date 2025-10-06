/**
 * Query Hooks - Centralized Exports
 *
 * Single import point for all TanStack Query hooks
 * Following patterns from commit a24d1f67d90381a2e181818f93b6a7ad63c062cc
 */

// ============================================================================
// QUERY HOOKS BY DOMAIN
// ============================================================================

// API Key queries (protected)
export {
  useApiKeyQuery,
  useApiKeysQuery,
} from './api-keys';

// Chat memory queries (protected)
export {
  useMemoriesQuery,
  useMemoryQuery,
} from './chat-memories';

// Chat custom role queries (protected)
export {
  useCustomRoleQuery,
  useCustomRolesQuery,
} from './chat-roles';

// Chat thread queries (protected)
export {
  usePublicThreadQuery,
  useThreadQuery,
  useThreadsQuery,
} from './chat-threads';

// Product queries (public)
export { useProductQuery, useProductsQuery } from './products';

// Subscription queries (protected)
export {
  useCurrentSubscriptionQuery,
  useSubscriptionQuery,
  useSubscriptionsQuery,
} from './subscriptions';

// Usage queries (protected)
export {
  useMessageQuotaQuery,
  useThreadQuotaQuery,
  useUsageStatsQuery,
} from './usage';
