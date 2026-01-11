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
 * IMPORTANT - Next.js 15/16 Loading Pattern:
 * - Use loading.tsx files at route level for page loading states
 * - Use Suspense only for specific async components (useSearchParams, etc.)
 * - Do NOT wrap layout children in Suspense - causes double loading states
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

export { PageLoadingFallback } from './page-loading-fallback';
export { SidebarLoadingFallback } from './sidebar-loading-fallback';
