/**
 * Unified Skeleton Components Library
 *
 * Server-safe, reusable skeleton components that match actual UI structures.
 * All skeletons use the base Skeleton component from @/components/ui/skeleton.
 *
 * Usage:
 * - Import specific skeletons needed for your loading state
 * - Configure variants/counts via props to match your UI
 * - Skeletons are server-safe (no hooks, no 'use client')
 */

export { AuthFormSkeleton } from './auth-form-skeleton';
export { ChatInputSkeleton } from './chat-input-skeleton';
export { MessageCardSkeleton } from './message-card-skeleton';
export { ModeratorCardSkeleton } from './moderator-card-skeleton';
export { ParticipantHeaderSkeleton } from './participant-header-skeleton';
export {
  PreSearchQuerySkeleton,
  PreSearchResultsSkeleton,
  PreSearchSkeleton,
} from './pre-search-skeleton';
export { PresetCardSkeleton } from './preset-card-skeleton';
export { QuickStartSkeleton } from './quick-start-skeleton';
export { ThreadListItemSkeleton } from './thread-list-item-skeleton';
