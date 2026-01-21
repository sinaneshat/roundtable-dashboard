import type { ComponentProps } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

/**
 * StatCardSkeleton - Statistics card loading skeleton
 *
 * Matches stat card layout with title, value, and trend indicator.
 * Used for dashboard metric cards.
 */
export function StatCardSkeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('rounded-2xl border bg-card p-6', className)} {...props}>
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-8 rounded" />
      </div>
      <Skeleton className="h-8 w-20 mb-2" />
      <div className="flex items-center space-x-2">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}
