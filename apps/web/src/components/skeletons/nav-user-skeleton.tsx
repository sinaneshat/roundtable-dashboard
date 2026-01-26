import type { ComponentProps } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

type NavUserSkeletonProps = {
  showChevron?: boolean;
  collapsed?: boolean;
} & ComponentProps<'div'>;

export function NavUserSkeleton({
  className,
  collapsed = false,
  showChevron = true,
  ...props
}: NavUserSkeletonProps) {
  if (collapsed) {
    return (
      <div
        className={cn('flex items-center justify-center', className)}
        {...props}
      >
        <Skeleton className="size-8 rounded-full" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-lg px-4 py-2 h-11',
        className,
      )}
      {...props}
    >
      <Skeleton className="size-8 rounded-full shrink-0" />
      <div className="grid flex-1 text-left leading-tight">
        <Skeleton className="h-4 w-24 mb-1" />
        <Skeleton className="h-3 w-32" />
      </div>
      {showChevron && <Skeleton className="size-4 ml-auto" />}
    </div>
  );
}
