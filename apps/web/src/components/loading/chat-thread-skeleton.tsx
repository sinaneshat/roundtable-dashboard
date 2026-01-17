/**
 * Chat Thread Loading Skeletons
 *
 * Uses reusable skeleton components from @/components/ui/skeleton
 * Matches the actual content layout for seamless loading UX
 */

import {
  QuickStartSkeleton,
  StickyInputSkeleton,
  ThreadMessagesSkeleton,
} from '@/components/ui/skeleton';

/**
 * Loading skeleton for chat thread page
 * Matches the layout structure of ChatView with messages
 */
export function ChatThreadSkeleton() {
  return (
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
  );
}

/**
 * Loading skeleton for chat overview/new chat page
 * Matches the layout structure of ChatOverviewScreen
 */
export function ChatOverviewSkeleton() {
  return (
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
  );
}
