import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading State for Chat Thread Page
 *
 * Shows skeleton for message area and input box.
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

      {/* Chat input skeleton - sticky at bottom */}
      <div className="sticky bottom-4 z-30 mt-auto bg-gradient-to-t from-background via-background to-transparent pt-6">
        <div className="w-full max-w-3xl mx-auto px-2 sm:px-4 md:px-6">
          <div className="rounded-2xl border border-white/10 bg-card shadow-lg p-3">
            {/* Toolbar skeleton */}
            <div className="flex items-center gap-2 mb-3">
              <Skeleton className="h-8 w-8 rounded-lg bg-white/10" />
              <Skeleton className="h-8 w-8 rounded-lg bg-white/10" />
              <Skeleton className="h-8 w-20 rounded-lg bg-white/10" />
            </div>
            {/* Textarea skeleton */}
            <div className="flex items-end gap-2">
              <Skeleton className="flex-1 h-[72px] rounded-xl bg-white/5" />
              <Skeleton className="h-10 w-10 rounded-full bg-white/10" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
