import type { ComponentProps } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

import { StickyInputSkeleton } from './sticky-input-skeleton';

/**
 * ThreadContentSkeleton - Chat thread view loading skeleton
 *
 * Matches thread view layout with messages area and sticky input.
 * Used when ChatThreadScreen is loading.
 */
export function ThreadContentSkeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('flex-1 flex flex-col', className)} {...props}>
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
          {[1, 2, 3].map(i => (
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
