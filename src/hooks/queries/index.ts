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

// Chat analysis queries (protected)
export { useThreadAnalysesQuery } from './chat/analysis';

// Chat changelog queries (protected)
export { useThreadChangelogQuery } from './chat/changelog';

// Chat custom role and feedback queries (protected)
export {
  useCustomRoleQuery,
  useCustomRolesQuery,
  useThreadFeedbackQuery,
} from './chat/feedback-and-roles';

// Chat message queries (protected)
export { useThreadMessagesQuery } from './chat/messages';

// Chat thread queries (protected)
export {
  usePublicThreadQuery,
  useThreadBySlugQuery,
  useThreadQuery,
  useThreadsQuery,
} from './chat/threads';

// Model queries (protected)
export { useModelsQuery } from './models';

// Product queries (public)
export { useProductQuery, useProductsQuery } from './products';

// Subscription queries (protected)
export {
  useCurrentSubscriptionQuery,
  useSubscriptionQuery,
  useSubscriptionsQuery,
} from './subscriptions';

// Upload queries (protected)
// Note: Thread/message associations are via junction tables
export {
  useUploadQuery,
  useUploadsQuery,
} from './uploads';

// Usage queries (protected)
export {
  useUsageStatsQuery,
} from './usage';
