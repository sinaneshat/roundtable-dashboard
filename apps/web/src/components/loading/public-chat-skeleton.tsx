/**
 * Public Chat Loading Skeleton
 *
 * Uses reusable skeleton components from @/components/ui/skeleton
 * Matches the layout structure of PublicChatThreadScreen
 */

import { Skeleton, ThreadMessagesSkeleton } from '@/components/ui/skeleton';

/**
 * Loading skeleton for public chat thread page
 * Matches the layout structure of PublicChatThreadScreen (no input, read-only)
 */
export function PublicChatSkeleton() {
  return (
    <div className="flex flex-col min-h-dvh relative">
      <div className="container max-w-4xl mx-auto px-5 md:px-6 pt-16 sm:pt-20 pb-16">
        {/* Header skeleton - thread title area */}
        <div className="mb-8 space-y-4">
          <Skeleton className="h-8 w-3/4 max-w-md" />
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>

        {/* Message skeletons - reuse ThreadMessagesSkeleton */}
        <ThreadMessagesSkeleton
          participantCount={3}
          showModerator={true}
          showInput={false}
        />

        {/* CTA skeleton at bottom - matches the glowing card */}
        <div className="mt-8 mb-8">
          <div className="rounded-2xl bg-card/50 backdrop-blur-sm p-8 text-center">
            <Skeleton className="size-6 mx-auto mb-4 rounded" />
            <Skeleton className="h-6 w-48 mx-auto mb-2" />
            <Skeleton className="h-4 w-64 mx-auto mb-6" />
            <Skeleton className="h-10 w-36 mx-auto rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
