import type React from 'react';

import { ChatHeaderSwitch } from '@/components/chat/chat-header-switch';
import { ThreadHeaderProvider } from '@/components/chat/thread-header-context';
import { SidebarLoadingFallback } from '@/components/loading';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { QuickStartSkeleton, Skeleton, StickyInputSkeleton } from '@/components/ui/skeleton';
import type { SessionData } from '@/lib/auth';
import dynamic from '@/lib/utils/dynamic';

// Dynamic import with ssr:false prevents hydration mismatch from React Query cache
const AppSidebar = dynamic(
  () => import('@/components/chat/chat-nav').then(m => ({ default: m.AppSidebar })),
  { ssr: false, loading: () => <SidebarLoadingFallback count={10} /> },
);

/**
 * Main content skeleton for overview/new chat - shown while ChatOverviewScreen loads
 * Matches ChatOverviewScreen initial UI layout for seamless transition
 */
export function MainContentSkeleton() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-2xl space-y-8">
        {/* Logo/Welcome area */}
        <div className="text-center space-y-4">
          <div className="size-16 rounded-2xl bg-accent animate-pulse mx-auto" />
          <Skeleton className="h-8 w-64 mx-auto" />
          <Skeleton className="h-5 w-96 max-w-full mx-auto" />
        </div>

        {/* Quick start suggestions skeleton */}
        <div className="rounded-2xl bg-card/50 overflow-hidden">
          <QuickStartSkeleton count={4} />
        </div>

        {/* Input area skeleton */}
        <StickyInputSkeleton />
      </div>
    </div>
  );
}

/**
 * Thread content skeleton - shown while ChatThreadScreen loads
 * Matches thread view layout with messages and input
 */
export function ThreadContentSkeleton() {
  return (
    <div className="flex-1 flex flex-col">
      {/* Messages area */}
      <div className="flex-1 overflow-hidden">
        <div className="w-full max-w-4xl mx-auto px-5 md:px-6 py-6 space-y-6">
          {/* User message skeleton */}
          <div className="flex justify-end">
            <div className="max-w-[80%] space-y-2">
              <div className="flex items-center gap-2 justify-end">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="size-8 rounded-full" />
              </div>
              <div className="bg-secondary rounded-2xl rounded-br-md px-4 py-3 space-y-2">
                <Skeleton className="h-4 w-72" />
                <Skeleton className="h-4 w-56" />
              </div>
            </div>
          </div>

          {/* Assistant message skeletons */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex justify-start">
              <div className="max-w-[85%] space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="size-8 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <div className="space-y-2 ps-10">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sticky input skeleton */}
      <StickyInputSkeleton />
    </div>
  );
}

type ChatLayoutShellProps = {
  children: React.ReactNode;
  session?: SessionData | null;
};

/**
 * Chat Layout Shell - Pure UI wrapper (no auth, no prefetching)
 * Provides sidebar navigation and header structure.
 * Auth and data fetching handled by route groups.
 */
export function ChatLayoutShell({ children, session = null }: ChatLayoutShellProps) {
  return (
    <ThreadHeaderProvider>
      <SidebarProvider>
        <AppSidebar initialSession={session} />

        <SidebarInset id="main-scroll-container" className="flex flex-col relative">
          <ChatHeaderSwitch />
          {children}
        </SidebarInset>
      </SidebarProvider>
    </ThreadHeaderProvider>
  );
}
