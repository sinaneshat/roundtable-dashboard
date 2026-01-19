import type { ComponentProps } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

/**
 * ModeratorCardSkeleton - Reusable skeleton for moderator decision cards
 *
 * Matches the structure of moderator cards that appear in chat threads.
 * Shows thinking process, participant selection, and decision rationale.
 */
export function ModeratorCardSkeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('mt-6', className)} {...props}>
      <div className="rounded-2xl bg-card/50 backdrop-blur-sm p-4 space-y-4 border border-border/50">
        <div className="flex items-center gap-2">
          <Skeleton className="size-4 rounded" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <div className="space-y-1.5">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-3 w-6" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
