import { StickyInputSkeleton, ThreadMessagesSkeleton } from '@/components/ui/skeleton';

/**
 * Loading State for Chat Thread Page
 *
 * Uses reusable skeleton components:
 * - ThreadMessagesSkeleton: User + AI messages + analysis card
 * - StickyInputSkeleton: Sticky bottom input
 *
 * Pattern: Next.js App Router loading.tsx convention
 */
export default function ChatThreadLoading() {
  return (
    <div className="relative min-h-svh flex flex-col">
      {/* Main content */}
      <div className="container max-w-3xl mx-auto px-4 sm:px-6 pt-4 pb-32 flex-1">
        <ThreadMessagesSkeleton participantCount={2} showAnalysis />
      </div>

      {/* Sticky input */}
      <StickyInputSkeleton />
    </div>
  );
}
