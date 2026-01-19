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
  LogoAreaSkeleton,
  QuickStartSkeleton,
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
 */
export function ChatOverviewSkeleton() {
  return (
    <SidebarProvider>
      <SidebarLoadingFallback count={10} />

      <SidebarInset className="flex flex-col relative">
        {/* Header skeleton - uses shared HeaderSkeleton */}
        <HeaderSkeleton variant="simple" />

        {/* Main content: Welcome + Quick Start + Input */}
        <div className="flex-1 relative">
          <div className="container max-w-4xl mx-auto px-5 md:px-6 relative flex flex-col items-center pt-6 sm:pt-8 pb-4">
            <div className="w-full">
              <div className="flex flex-col items-center gap-4 sm:gap-6 text-center relative">
                {/* Logo area - uses shared LogoAreaSkeleton */}
                <LogoAreaSkeleton size="large" showTitle showTagline />

                {/* Quick start: w-full mt-6 sm:mt-8 */}
                <div className="w-full mt-6 sm:mt-8">
                  <div className="rounded-2xl bg-card/50 overflow-hidden border border-border/30">
                    <QuickStartSkeleton count={4} />
                  </div>
                </div>

                {/* Input area - uses shared StickyInputSkeleton content without sticky wrapper */}
                <div className="w-full mt-14">
                  <div className="rounded-2xl border border-border/50 shadow-lg bg-card overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
                      <div className="h-5 w-24 bg-accent animate-pulse rounded-xl" />
                      <div className="h-8 w-20 bg-accent animate-pulse rounded-full" />
                    </div>
                    <div className="p-4">
                      <div className="h-12 w-full bg-accent animate-pulse rounded-xl" />
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-2">
                          <div className="size-6 bg-accent animate-pulse rounded" />
                          <div className="size-6 bg-accent animate-pulse rounded" />
                        </div>
                        <div className="size-8 bg-accent animate-pulse rounded-full" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
