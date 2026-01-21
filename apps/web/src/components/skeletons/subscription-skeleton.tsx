import type { ComponentProps } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

/**
 * SubscriptionSkeleton - Subscription card loading skeleton
 *
 * Matches subscription display with plan details, usage, and actions.
 * Used for billing and subscription management loading states.
 */
export function SubscriptionSkeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('rounded-2xl border bg-card', className)} {...props}>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      </div>
      <div className="px-6 py-4 bg-accent/50 rounded-b-2xl">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-24 rounded" />
        </div>
      </div>
    </div>
  );
}
