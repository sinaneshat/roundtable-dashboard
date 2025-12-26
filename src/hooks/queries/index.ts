/**
 * Query Hooks - Centralized Exports
 *
 * Single import point for all TanStack Query hooks
 */

// ============================================================================
// QUERY HOOKS BY DOMAIN
// ============================================================================

// API Key queries (protected)
export {
  useApiKeyQuery,
  useApiKeysQuery,
} from './api-keys';

// Chat changelog queries (protected)
export { useThreadChangelogQuery } from './chat/changelog';

// Chat custom role, feedback, and user preset queries (protected)
export {
  useCustomRoleQuery,
  useCustomRolesQuery,
  useThreadFeedbackQuery,
  useUserPresetQuery,
  useUserPresetsQuery,
} from './chat/feedback-and-roles';

// Chat message queries (protected)
export { useThreadMessagesQuery } from './chat/messages';

// Chat pre-search queries (protected)
export { useThreadPreSearchesQuery } from './chat/pre-search';

// Chat thread queries (protected)
export {
  usePublicThreadQuery,
  useThreadBySlugQuery,
  useThreadQuery,
  useThreadSlugStatusQuery,
  useThreadsQuery,
} from './chat/threads';

// Model queries (protected)
export { useModelsQuery } from './models';

// Product queries (public)
export { useProductQuery, useProductsQuery } from './products';

// Project queries (protected)
export {
  useProjectAttachmentsQuery,
  useProjectContextQuery,
  useProjectMemoriesQuery,
  useProjectQuery,
  useProjectsQuery,
} from './projects';

// Subscription queries (protected)
export {
  useCurrentSubscriptionQuery,
  useSubscriptionQuery,
  useSubscriptionsQuery,
} from './subscriptions';

// Upload queries (protected)
// Note: Thread/message associations are via junction tables
export {
  useDownloadUrlQuery,
  useUploadQuery,
  useUploadsQuery,
} from './uploads';

// Usage queries (protected)
export {
  useUsageStatsQuery,
} from './usage';
