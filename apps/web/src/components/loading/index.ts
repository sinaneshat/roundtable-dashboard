/**
 * Reusable Loading Components
 *
 * Standardized loading states for Suspense boundaries across the application.
 * These components provide consistent loading UX and reduce inline JSX duplication.
 *
 * Available Components:
 * - PageLoadingFallback: Full-page loading (auth, errors, redirects)
 * - SidebarLoadingFallback: Sidebar loading (navigation, chat sidebar)
 *
 * TanStack Start Loading Pattern:
 * - Use route loaders for data loading states
 * - Use Suspense for lazy-loaded components
 *
 * Usage Pattern:
 * ```tsx
 * import { PageLoadingFallback } from '@/components/loading';
 *
 * <Suspense fallback={<PageLoadingFallback text="Loading..." />}>
 *   <YourComponent />
 * </Suspense>
 * ```
 */

export { AuthCallbackSkeleton, AuthLoadingSkeleton } from './auth-loading-skeleton';
export { PageLoadingFallback } from './page-loading-fallback';
export { PublicChatSkeleton } from './public-chat-skeleton';
export { SidebarLoadingFallback } from './sidebar-loading-fallback';
