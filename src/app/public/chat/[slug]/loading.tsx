import { Skeleton, ThreadMessagesSkeleton } from '@/components/ui/skeleton';

/**
 * Loading State for Public Chat Thread Page
 *
 * Uses reusable skeleton components:
 * - ThreadMessagesSkeleton: User + AI messages + analysis card
 * - CTA card skeleton (inline - public-only)
 *
 * Note: No input skeleton (read-only view)
 */
export default function PublicChatThreadLoading() {
  return (
    <div className="relative flex flex-1 flex-col min-h-0 h-full">
      <div className="flex flex-col min-h-screen relative">
        <div
          id="public-chat-scroll-container"
          className="container max-w-3xl mx-auto px-3 sm:px-4 md:px-6 pt-16 sm:pt-20 pb-24 sm:pb-32 flex-1"
        >
          {/* Thread messages */}
          <ThreadMessagesSkeleton participantCount={2} showAnalysis />

          {/* CTA Card Skeleton - public thread only */}
          <div className="mt-12 sm:mt-16 mb-6 sm:mb-8">
            <div className="rounded-2xl sm:rounded-xl border bg-gradient-to-br from-primary/5 via-primary/3 to-background p-6 sm:p-8 md:p-10 text-center space-y-4 sm:space-y-6">
              <Skeleton className="size-12 sm:size-14 rounded-full bg-primary/10 mx-auto" />
              <div className="space-y-2 sm:space-y-3">
                <Skeleton className="h-8 sm:h-10 w-64 sm:w-80 mx-auto bg-white/15" />
                <Skeleton className="h-5 w-80 sm:w-96 mx-auto bg-white/10" />
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2 sm:pt-4">
                <Skeleton className="h-10 w-full sm:w-32 bg-primary/20" />
                <Skeleton className="h-10 w-full sm:w-32 bg-white/10" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
