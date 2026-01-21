/**
 * Unified Skeleton Components Library
 *
 * Server-safe, reusable skeleton components that match actual UI structures.
 * All skeletons use the base Skeleton component from @/components/ui/skeleton.
 *
 * Architecture:
 * - /components/ui/skeleton.tsx → Base Skeleton primitive ONLY
 * - /components/skeletons/ → All composed skeletons (this folder)
 * - /components/loading/ → Full-page loading compositions
 */

// Authentication
export { AuthFormSkeleton } from './auth-form-skeleton';

// Layout Components
export { BreadcrumbSkeleton } from './breadcrumb-skeleton';
// Data Display
export { CardSkeleton } from './card-skeleton';
export { ChartSkeleton } from './chart-skeleton';
// Chat & Messaging
export { ChatInputSkeleton } from './chat-input-skeleton';
export { HeaderSkeleton } from './header-skeleton';
export { LogoAreaSkeleton } from './logo-area-skeleton';
// Page Content
export { MainContentSkeleton } from './main-content-skeleton';
export { MessageCardSkeleton } from './message-card-skeleton';
export { ModeratorCardSkeleton } from './moderator-card-skeleton';
export { NavUserSkeleton } from './nav-user-skeleton';
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

// Utilities (internal use - export for sidebar-loading-fallback)
export { getSkeletonOpacity, getSkeletonWidth, SIDEBAR_SKELETON_WIDTHS } from './skeleton-utils';
export { StatCardSkeleton } from './stat-card-skeleton';
// Status Pages (billing success/failure)
export { StatusPageSkeleton } from './status-page-skeleton';
export { StickyInputSkeleton } from './sticky-input-skeleton';
export { SubscriptionSkeleton } from './subscription-skeleton';
export { TableRowSkeleton } from './table-row-skeleton';
export { ThreadContentSkeleton } from './thread-content-skeleton';
export { ThreadListItemSkeleton } from './thread-list-item-skeleton';
export { ThreadMessagesSkeleton } from './thread-messages-skeleton';
