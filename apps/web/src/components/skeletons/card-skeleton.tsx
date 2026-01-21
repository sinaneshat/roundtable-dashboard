import type { ComponentProps } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

/**
 * CardSkeleton - Generic card loading skeleton
 *
 * Matches standard card layout with header, content, and footer areas.
 * Used for general card loading states.
 */
export function CardSkeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('rounded-2xl border bg-card p-6 space-y-4', className)} {...props}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-6 w-16" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="flex items-center space-x-4">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    </div>
  );
}
