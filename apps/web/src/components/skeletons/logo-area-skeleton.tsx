import type { ComponentProps } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

type LogoAreaSkeletonProps = {
  size?: 'small' | 'medium' | 'large';
  showTitle?: boolean;
  showTagline?: boolean;
} & ComponentProps<'div'>;

const sizeClasses = {
  small: 'h-12 w-12 sm:h-14 sm:w-14',
  medium: 'h-16 w-16 sm:h-20 sm:w-20',
  large: 'h-20 w-20 sm:h-24 sm:w-24',
} as const;

export function LogoAreaSkeleton({
  size = 'large',
  showTitle = true,
  showTagline = true,
  className,
  ...props
}: LogoAreaSkeletonProps) {
  return (
    <div
      className={cn('flex flex-col items-center gap-4 sm:gap-6 text-center', className)}
      {...props}
    >
      <div className={cn('relative', sizeClasses[size])}>
        <Skeleton className="w-full h-full rounded-2xl" />
      </div>

      {(showTitle || showTagline) && (
        <div className="flex flex-col items-center gap-1.5">
          {showTitle && (
            <Skeleton className="h-9 sm:h-10 w-48 sm:w-56" />
          )}
          {showTagline && (
            <Skeleton className="h-5 sm:h-6 w-72 sm:w-96 max-w-full" />
          )}
        </div>
      )}
    </div>
  );
}
