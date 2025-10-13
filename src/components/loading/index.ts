/**
 * Reusable Loading Components
 *
 * Standardized loading states for Suspense boundaries across the application.
 * These components provide consistent loading UX and reduce inline JSX duplication.
 *
 * Available Components:
 * - PageLoadingFallback: Full-page loading (auth, errors, redirects)
 * - ContentLoadingFallback: Content area loading (main content within layouts)
 * - SidebarLoadingFallback: Sidebar loading (navigation, chat sidebar)
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

export { ContentLoadingFallback } from './content-loading-fallback';
export { PageLoadingFallback } from './page-loading-fallback';
export { SidebarLoadingFallback } from './sidebar-loading-fallback';
