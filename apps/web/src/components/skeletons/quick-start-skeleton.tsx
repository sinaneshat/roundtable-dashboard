import type { ComponentProps } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

type QuickStartSkeletonProps = {
  count?: number;
} & ComponentProps<'div'>;

/**
 * QuickStartSkeleton - Reusable skeleton for quick start suggestion items
 *
 * Matches the structure of quick start suggestion cards on the chat overview screen.
 * Shows suggestion text with participant avatars and role badges.
 *
 * @param props - Component props
 * @param props.count - Number of quick start items to render
 * @param props.className - Optional CSS class names
 */
export function QuickStartSkeleton({ count = 3, className, ...props }: QuickStartSkeletonProps) {
  return (
    <div className={cn('flex flex-col', className)} {...props}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={cn('px-4 py-3', i < count - 1 && 'border-b border-border/50')}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3">
            <Skeleton className="h-5 w-full sm:w-3/4" />
            <div className="flex items-center gap-2 shrink-0">
              <Skeleton className="h-6 w-16 rounded-2xl" />
              <div className="flex items-center">
                <div className="flex -space-x-2">
                  <Skeleton className="size-6 rounded-full relative z-[3]" />
                  <Skeleton className="size-6 rounded-full relative z-[2]" />
                  <Skeleton className="size-6 rounded-full relative z-[1]" />
                </div>
                <Skeleton className="size-6 rounded-full ms-2" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
