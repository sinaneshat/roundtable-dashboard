import type { ComponentProps } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

type StatusPageSkeletonProps = {
  /** Show plan badge + active until row (for success pages) */
  showPlanInfo?: boolean;
  /** Show auto-redirect text */
  showRedirectText?: boolean;
  /** Number of action buttons (default: 1) */
  actionCount?: 1 | 2;
} & ComponentProps<'div'>;

/**
 * StatusPageSkeleton - Matches StatusPage layout EXACTLY
 *
 * Structure: Horizontally centered, top-aligned (NOT vertically centered)
 * - px-4 py-8 padding
 * - max-w-md content width
 * - gap-6 between elements
 *
 * Reused by: BillingSuccessSkeleton, BillingFailureSkeleton
 */
export function StatusPageSkeleton({
  actionCount = 1,
  className,
  showPlanInfo = false,
  showRedirectText = false,
  ...props
}: StatusPageSkeletonProps) {
  return (
    <div
      className={cn('flex flex-1 min-h-0 w-full flex-col items-center px-4 py-8', className)}
      {...props}
    >
      <div className="flex flex-col items-center gap-6 w-full max-w-md">
        {/* Icon ring - size-16 rounded-full ring-4 */}
        <Skeleton className="size-16 rounded-full" />

        {/* Title + description - space-y-1.5 text-center */}
        <div className="space-y-1.5 text-center w-full">
          <Skeleton className="h-6 w-48 mx-auto" />
          <Skeleton className="h-4 w-64 mx-auto" />
        </div>

        {/* Optional: Plan badge + active until (children slot in StatusPage) */}
        {showPlanInfo && (
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-14 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
        )}

        {/* Actions - flex flex-col gap-2 w-full */}
        <div className="flex flex-col gap-2 w-full">
          <Skeleton className="h-11 w-full rounded-xl" />
          {actionCount >= 2 && <Skeleton className="h-10 w-full rounded-xl" />}
        </div>

        {/* Optional: Auto-redirect text */}
        {showRedirectText && <Skeleton className="h-3 w-48" />}
      </div>
    </div>
  );
}
