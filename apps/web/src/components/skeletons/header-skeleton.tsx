import type { ComponentProps } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

type HeaderSkeletonProps = {
  variant?: 'simple' | 'with-breadcrumb' | 'with-actions';
  showTrigger?: boolean;
} & ComponentProps<'header'>;

/**
 * HeaderSkeleton - Reusable skeleton for page/layout headers
 *
 * Matches various header layouts across the application.
 * Used in layout shells, route loading states, and page headers.
 *
 * @param props.variant - Layout variant: simple (icon+title), with-breadcrumb, with-actions
 * @param props.showTrigger - Whether to show sidebar trigger skeleton
 */
export function HeaderSkeleton({
  variant = 'simple',
  showTrigger = true,
  className,
  ...props
}: HeaderSkeletonProps) {
  return (
    <header
      className={cn(
        'sticky top-0 left-0 right-0 z-50 flex h-14 sm:h-16 shrink-0 items-center gap-2',
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2 pt-4 px-5 md:px-6 lg:px-8 h-14 sm:h-16 w-full">
        {showTrigger && <Skeleton className="size-8 rounded-lg" />}

        {variant === 'simple' && (
          <Skeleton className="h-5 w-32" />
        )}

        {variant === 'with-breadcrumb' && (
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-5 w-48" />
          </div>
        )}

        {variant === 'with-actions' && (
          <>
            <Skeleton className="h-5 w-48" />
            <div className="ml-auto flex items-center gap-2">
              <Skeleton className="size-8 rounded-lg" />
              <Skeleton className="size-8 rounded-lg" />
            </div>
          </>
        )}
      </div>
    </header>
  );
}
