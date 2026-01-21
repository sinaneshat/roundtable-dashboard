import type { ComponentProps } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

import { getSkeletonOpacity, getSkeletonWidth } from './skeleton-utils';

type ThreadListItemSkeletonProps = {
  count?: number;
  animated?: boolean;
  widthVariant?: number;
} & ComponentProps<'div'>;

export function ThreadListItemSkeleton({
  count = 1,
  animated = false,
  widthVariant,
  className,
  ...props
}: ThreadListItemSkeletonProps) {
  if (count === 1) {
    const width = widthVariant !== undefined
      ? getSkeletonWidth(widthVariant)
      : '70%';

    return (
      <Skeleton
        className={cn('h-5 rounded-full', animated && 'animate-pulse', className)}
        style={{ width }}
        {...props}
      />
    );
  }

  return (
    <div
      className={cn('flex flex-col gap-3 pointer-events-none select-none', className)}
      aria-hidden="true"
      {...props}
    >
      {Array.from({ length: count }, (_, i) => (
        <Skeleton
          key={`thread-skeleton-${i}`}
          className={cn('h-5 rounded-full', animated && 'animate-pulse')}
          style={{
            width: getSkeletonWidth(i),
            opacity: getSkeletonOpacity(i),
          }}
        />
      ))}
    </div>
  );
}
