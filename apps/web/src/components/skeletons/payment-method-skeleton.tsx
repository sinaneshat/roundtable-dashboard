import type { ComponentProps } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

/**
 * PaymentMethodSkeleton - Payment method card loading skeleton
 *
 * Matches payment method display with card icon, details, and actions.
 * Used for billing and payment settings loading states.
 */
export function PaymentMethodSkeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('rounded-2xl border bg-card p-6 space-y-4', className)} {...props}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded" />
          <div className="space-y-1">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-8 w-8 rounded" />
        </div>
      </div>
      <div className="flex items-center justify-between pt-2 border-t">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  );
}
