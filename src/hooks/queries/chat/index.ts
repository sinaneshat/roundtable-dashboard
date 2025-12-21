/**
 * Chat Query Hooks - Barrel Exports
 *
 * Centralized exports for all chat-related TanStack Query hooks
 * Enables clean imports: import { useThreadsQuery, useThreadMessagesQuery } from '@/hooks/queries/chat'
 *
 * File Organization:
 * - threads.ts: Thread CRUD operations (list, get, public)
 * - messages.ts: Thread message operations
 * - changelog.ts: Thread configuration changelog
 * - feedback-and-roles.ts: Thread feedback and custom roles
 */

// Thread changelog
export { useThreadChangelogQuery } from './changelog';

// Thread feedback and custom roles
export {
  useCustomRoleQuery,
  useCustomRolesQuery,
  useThreadFeedbackQuery,
} from './feedback-and-roles';

// Thread messages
export { useThreadMessagesQuery } from './messages';

// Thread CRUD operations
export {
  usePublicThreadQuery,
  useThreadBySlugQuery,
  useThreadQuery,
  useThreadsQuery,
} from './threads';
