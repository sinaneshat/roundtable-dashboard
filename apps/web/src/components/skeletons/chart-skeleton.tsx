import type { ComponentProps } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

/**
 * ChartSkeleton - Chart/graph loading skeleton
 *
 * Matches chart container with header and visualization area.
 * Used for analytics and data visualization loading states.
 */
export function ChartSkeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('rounded-2xl border bg-card p-6', className)} {...props}>
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-1">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="h-32 w-full bg-accent animate-pulse rounded" />
    </div>
  );
}
