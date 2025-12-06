import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading State for Chat Thread Page
 *
 * Minimal loading skeleton for message area only.
 * NO input skeleton - avoids duplication with ChatView's real input.
 *
 * Architecture:
 * - Layout Suspense uses ContentLoadingFallback (minimal)
 * - This loading.tsx shows message area skeleton only
 * - ChatView provides the real sticky input when loaded
 *
 * Pattern: Next.js App Router loading.tsx convention
 */
export default function ChatThreadLoading() {
  return (
    <div className="flex flex-col relative flex-1 min-h-full">
      {/* Messages area skeleton - matches ChatView container */}
      <div className="container max-w-3xl mx-auto px-2 sm:px-4 md:px-6 pt-4 pb-32">
        {/* User message skeleton */}
        <div className="mb-6 flex justify-end">
          <div className="max-w-[80%]">
            <div className="flex items-center gap-3 py-2 mb-2 flex-row-reverse">
              <Skeleton className="size-8 rounded-full bg-white/15" />
              <Skeleton className="h-5 w-24 bg-white/20" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full bg-white/15" />
              <Skeleton className="h-4 w-3/4 bg-white/15" />
            </div>
          </div>
        </div>

        {/* AI response skeletons (2 participants) */}
        {[0, 1].map(i => (
          <div key={i} className="mb-6 flex justify-start">
            <div className="max-w-[85%]">
              <div className="flex items-center gap-3 py-2 mb-2">
                <Skeleton className="size-8 rounded-full bg-white/15" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-32 bg-white/20" />
                  <Skeleton className="h-4 w-20 bg-white/15" />
                </div>
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-full bg-white/10" />
                <Skeleton className="h-4 w-full bg-white/10" />
                <Skeleton className="h-4 w-5/6 bg-white/10" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
