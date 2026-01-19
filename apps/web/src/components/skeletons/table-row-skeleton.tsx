import type { ComponentProps } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

type TableRowSkeletonProps = {
  columns?: number;
} & ComponentProps<'div'>;

/**
 * TableRowSkeleton - Table row loading skeleton
 *
 * Matches table row structure with configurable column count.
 * First column is wider for primary content.
 */
export function TableRowSkeleton({ columns = 4, className, ...props }: TableRowSkeletonProps) {
  return (
    <div className={cn('flex items-center space-x-4 p-4 border-b', className)} {...props}>
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={i} className={cn('h-4', i === 0 ? 'w-48' : 'w-24')} />
      ))}
    </div>
  );
}
