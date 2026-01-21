import type { ComponentProps } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

type HeaderSkeletonProps = {
  variant?: 'simple' | 'with-breadcrumb' | 'with-actions';
  showTrigger?: boolean;
} & ComponentProps<'header'>;

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
        // Match NavigationHeader: bg-background when not overview
        variant !== 'simple' && 'bg-background w-full',
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-between gap-2 pt-4 px-5 md:px-6 lg:px-8 h-14 sm:h-16 w-full">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          {/* Mobile sidebar trigger - only visible on mobile */}
          {showTrigger && (
            <Skeleton className="size-11 rounded-lg md:hidden shrink-0" />
          )}

          {variant === 'simple' && (
            // MinimalHeader: just the trigger, nothing else visible on desktop
            <div className="hidden md:block h-14 sm:h-16" />
          )}

          {variant === 'with-breadcrumb' && (
            // NavigationHeader with breadcrumb: Brand > Title
            <div className="flex items-center gap-2 min-w-0">
              {/* Brand name */}
              <Skeleton className="h-4 w-20 shrink-0" />
              {/* Separator */}
              <span className="text-muted-foreground/30">/</span>
              {/* Thread/page title */}
              <Skeleton className="h-4 w-32 sm:w-48" />
            </div>
          )}

          {variant === 'with-actions' && (
            <div className="flex items-center gap-2 min-w-0">
              <Skeleton className="h-4 w-20 shrink-0" />
              <span className="text-muted-foreground/30">/</span>
              <Skeleton className="h-4 w-32 sm:w-48" />
            </div>
          )}
        </div>

        {/* Actions area - only for with-actions variant */}
        {variant === 'with-actions' && (
          <div className="flex items-center gap-2 shrink-0">
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="size-8 rounded-lg" />
          </div>
        )}
      </div>
    </header>
  );
}
