/**
 * Chat Thread Loading Skeletons - Full Page
 *
 * These skeletons replace the ENTIRE route tree including layout during loading.
 * Each skeleton includes: SidebarProvider + Sidebar + SidebarInset + Content
 * Matches the actual ChatLayoutShell + content layout for seamless loading UX.
 */

import { SidebarLoadingFallback } from '@/components/loading/sidebar-loading-fallback';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  QuickStartSkeleton,
  StickyInputSkeleton,
  ThreadMessagesSkeleton,
} from '@/components/ui/skeleton';

/**
 * Full page skeleton for chat thread route
 * Includes: Sidebar + Header + Message List + Input
 */
export function ChatThreadSkeleton() {
  return (
    <SidebarProvider>
      <SidebarLoadingFallback count={10} />

      <SidebarInset className="flex flex-col relative">
        {/* Header skeleton */}
        <header className="sticky top-0 left-0 right-0 z-50 flex h-14 sm:h-16 shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 pt-4 px-5 md:px-6 lg:px-8 h-14 sm:h-16 w-full">
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="h-5 w-48" />
          </div>
        </header>

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
        {/* Header skeleton */}
        <header className="sticky top-0 left-0 right-0 z-50 flex h-14 sm:h-16 shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 pt-4 px-5 md:px-6 lg:px-8 h-14 sm:h-16 w-full">
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="h-5 w-32" />
          </div>
        </header>

        {/* Main content: Welcome + Quick Start + Input */}
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="w-full max-w-2xl space-y-8">
            {/* Logo/Welcome area */}
            <div className="text-center space-y-4">
              <div className="size-16 rounded-2xl bg-accent animate-pulse mx-auto" />
              <div className="h-8 w-64 rounded-xl bg-accent animate-pulse mx-auto" />
              <div className="h-5 w-96 max-w-full rounded-lg bg-accent/70 animate-pulse mx-auto" />
            </div>

            {/* Quick start suggestions */}
            <div className="rounded-2xl bg-card/50 overflow-hidden">
              <QuickStartSkeleton count={4} />
            </div>

            {/* Input area */}
            <StickyInputSkeleton />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
