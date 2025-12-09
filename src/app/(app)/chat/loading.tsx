import Image from 'next/image';

import { Skeleton } from '@/components/ui/skeleton';
import { BRAND } from '@/constants/brand';

/**
 * Loading State for Chat Overview Page
 *
 * Matches exact structure of ChatOverviewScreen:
 * - Logo: h-20 w-20 sm:h-24 sm:w-24
 * - Title: text-3xl sm:text-4xl
 * - Quick start: Simple list items with mode badge and avatars
 * - Input: Inline at bottom (not sticky)
 *
 * Pattern: Next.js App Router loading.tsx convention
 */
export default function ChatOverviewLoading() {
  return (
    <div className="flex flex-col relative flex-1 min-h-dvh">
      {/* Main content - matches ChatOverviewScreen container */}
      <div className="container max-w-3xl mx-auto px-2 sm:px-4 md:px-6 relative flex flex-col items-center pt-6 sm:pt-8 pb-8">
        <div className="w-full">
          <div className="flex flex-col items-center gap-4 sm:gap-6 text-center relative">
            {/* Logo - matches: h-20 w-20 sm:h-24 sm:w-24 */}
            <div className="relative h-20 w-20 sm:h-24 sm:w-24">
              <Image
                src={BRAND.logos.main}
                alt={BRAND.name}
                className="w-full h-full object-contain"
                width={96}
                height={96}
                priority
              />
            </div>

            {/* Title and tagline - matches: text-3xl sm:text-4xl + text-sm sm:text-base */}
            <div className="flex flex-col items-center gap-1.5">
              <Skeleton className="h-9 sm:h-10 w-40 sm:w-48 bg-white/20" />
              <Skeleton className="h-4 sm:h-5 w-64 sm:w-80 bg-white/15" />
            </div>

            {/* Quick Start Cards - matches ChatQuickStart structure */}
            <div className="w-full mt-6 sm:mt-8">
              <div className="flex flex-col">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="px-4 py-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3">
                      {/* Question skeleton */}
                      <Skeleton className="h-4 sm:h-5 w-full sm:w-3/4 bg-white/15" />
                      {/* Mode badge + avatars */}
                      <div className="flex items-center gap-2 shrink-0">
                        <Skeleton className="h-6 w-16 rounded-2xl bg-white/10" />
                        <div className="flex items-center">
                          <div className="flex -space-x-2">
                            <Skeleton className="size-6 rounded-full bg-white/15 relative z-[3]" />
                            <Skeleton className="size-6 rounded-full bg-white/15 relative z-[2]" />
                            <Skeleton className="size-6 rounded-full bg-white/15 relative z-[1]" />
                          </div>
                          <Skeleton className="size-6 rounded-full bg-white/30 ml-2" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Input skeleton - matches inline ChatInput placement */}
        <div className="w-full mt-6 sm:mt-8 pb-4">
          <div className="rounded-2xl bg-card border border-white/[0.12] shadow-lg p-3">
            <Skeleton className="h-10 w-full bg-white/10 rounded-lg" />
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                <Skeleton className="size-5 rounded bg-white/10" />
                <Skeleton className="size-5 rounded bg-white/10" />
                <Skeleton className="size-5 rounded bg-white/10" />
              </div>
              <Skeleton className="size-7 rounded-full bg-white/15" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
