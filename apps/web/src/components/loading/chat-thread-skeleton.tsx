/**
 * Chat Thread Loading Skeletons - Full Page
 *
 * These skeletons replace the ENTIRE route tree including layout during loading.
 * Each skeleton includes: SidebarProvider + Sidebar + SidebarInset + Content
 * Matches the actual ChatLayoutShell + content layout for seamless loading UX.
 *
 * Uses consolidated skeleton components for consistency with actual UI.
 */

import { SidebarLoadingFallback } from '@/components/loading/sidebar-loading-fallback';
import {
  HeaderSkeleton,
  MainContentSkeleton,
  StickyInputSkeleton,
  ThreadMessagesSkeleton,
} from '@/components/skeletons';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

/**
 * Full page skeleton for chat thread route
 * Includes: Sidebar + Header + Message List + Input
 */
export function ChatThreadSkeleton() {
  return (
    <SidebarProvider>
      <SidebarLoadingFallback count={10} />

      <SidebarInset className="flex flex-col relative">
        {/* Header skeleton - uses shared HeaderSkeleton */}
        <HeaderSkeleton variant="with-breadcrumb" />

        {/* Main content: Messages + Input */}
        <div className="flex-1 flex flex-col">
          {/* Messages area */}
          <div className="flex-1 overflow-hidden">
            <div className="w-full max-w-4xl mx-auto px-5 md:px-6 py-6">
              <ThreadMessagesSkeleton
                participantCount={3}
                showModerator={true}
                showInput={false}
              />
            </div>
          </div>

          {/* Sticky input */}
          <StickyInputSkeleton />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

/**
 * Full page skeleton for chat overview/new chat route
 * Includes: Sidebar + Header + Welcome Content + Quick Start + Input
 *
 * Uses shared skeleton components (MainContentSkeleton) for single source of truth.
 */
export function ChatOverviewSkeleton() {
  return (
    <SidebarProvider>
      <SidebarLoadingFallback count={10} />

      <SidebarInset className="flex flex-col relative">
        {/* Header skeleton - uses shared HeaderSkeleton */}
        <HeaderSkeleton variant="simple" />

        {/* Main content - uses shared MainContentSkeleton for single source of truth */}
        <MainContentSkeleton />
      </SidebarInset>
    </SidebarProvider>
  );
}
