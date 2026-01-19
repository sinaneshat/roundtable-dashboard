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
 *
 * Structure:
 * - /components/ui/skeleton.tsx → Base Skeleton primitive ONLY
 * - /components/skeletons/ → All composed skeletons (this folder)
 * - /components/loading/ → Full-page loading compositions
 */

// Authentication
export { AuthFormSkeleton } from './auth-form-skeleton';

// Data Display
export { CardSkeleton } from './card-skeleton';
export { ChartSkeleton } from './chart-skeleton';
// Chat & Messaging
export { ChatInputSkeleton } from './chat-input-skeleton';
// Page Content
export { MainContentSkeleton } from './main-content-skeleton';
export { MessageCardSkeleton } from './message-card-skeleton';
export { ModeratorCardSkeleton } from './moderator-card-skeleton';
export { ParticipantHeaderSkeleton } from './participant-header-skeleton';
// Billing & Subscriptions
export { PaymentMethodSkeleton } from './payment-method-skeleton';

// Search & Discovery
export {
  PreSearchQuerySkeleton,
  PreSearchResultsSkeleton,
  PreSearchSkeleton,
} from './pre-search-skeleton';
// Configuration & Settings
export { PresetCardSkeleton } from './preset-card-skeleton';

// Navigation & Lists
export { QuickStartSkeleton } from './quick-start-skeleton';
export { StatCardSkeleton } from './stat-card-skeleton';
export { StickyInputSkeleton } from './sticky-input-skeleton';
export { SubscriptionSkeleton } from './subscription-skeleton';
export { TableRowSkeleton } from './table-row-skeleton';
export { ThreadContentSkeleton } from './thread-content-skeleton';
export { ThreadListItemSkeleton } from './thread-list-item-skeleton';
export { ThreadMessagesSkeleton } from './thread-messages-skeleton';
