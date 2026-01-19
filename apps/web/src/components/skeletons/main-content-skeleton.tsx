import type { ComponentProps } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

import { QuickStartSkeleton } from './quick-start-skeleton';

/**
 * MainContentSkeleton - Chat overview/new chat loading skeleton
 *
 * Matches ChatOverviewScreen initial UI layout EXACTLY for seamless transition.
 * Container max-w-4xl matches actual content for consistent width.
 */
export function MainContentSkeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('flex flex-col relative flex-1', className)} {...props}>
      <div className="flex-1 relative">
        {/* Match: container max-w-4xl mx-auto px-5 md:px-6 pt-6 sm:pt-8 pb-4 */}
        <div className="container max-w-4xl mx-auto px-5 md:px-6 relative flex flex-col items-center pt-6 sm:pt-8 pb-4">
          <div className="w-full">
            <div className="flex flex-col items-center gap-4 sm:gap-6 text-center relative">
              {/* Logo: h-20 w-20 sm:h-24 sm:w-24 */}
              <div className="relative h-20 w-20 sm:h-24 sm:w-24">
                <Skeleton className="w-full h-full rounded-2xl" />
              </div>

              {/* Title + tagline */}
              <div className="flex flex-col items-center gap-1.5">
                {/* Title: text-3xl sm:text-4xl */}
                <Skeleton className="h-9 sm:h-10 w-48 sm:w-56" />
                {/* Tagline: text-sm sm:text-base max-w-2xl */}
                <Skeleton className="h-5 sm:h-6 w-72 sm:w-96 max-w-full" />
              </div>

              {/* Quick start: w-full mt-6 sm:mt-8 */}
              <div className="w-full mt-6 sm:mt-8">
                <div className="rounded-2xl bg-card/50 overflow-hidden border border-border/30">
                  <QuickStartSkeleton count={4} />
                </div>
              </div>

              {/* Input container: w-full mt-14 */}
              <div className="w-full mt-14">
                {/* Match ChatInputContainer: rounded-2xl border shadow-lg bg-card */}
                <div className="rounded-2xl border border-border/50 shadow-lg bg-card overflow-hidden">
                  {/* Header skeleton */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-8 w-20 rounded-full" />
                  </div>
                  {/* Input area skeleton */}
                  <div className="p-4">
                    <Skeleton className="h-12 w-full rounded-xl" />
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-2">
                        <Skeleton className="size-6 rounded" />
                        <Skeleton className="size-6 rounded" />
                      </div>
                      <Skeleton className="size-8 rounded-full" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
