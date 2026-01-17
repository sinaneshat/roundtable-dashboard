import { Skeleton } from '@/components/ui/skeleton';

/**
 * Billing Failure Page Skeleton
 * Matches BillingFailureClient structure
 */
export function BillingFailureSkeleton() {
  return (
    <div className="flex flex-1 w-full flex-col items-center justify-center px-4 py-8">
      <div className="flex w-full max-w-2xl flex-col items-center gap-6 text-center mx-auto">
        {/* Error icon skeleton */}
        <Skeleton className="size-20 md:size-24 rounded-full" />

        {/* Title and description */}
        <div className="space-y-2 w-full">
          <Skeleton className="h-8 w-64 mx-auto" />
          <Skeleton className="h-5 w-96 mx-auto" />
        </div>

        {/* Error alert skeleton */}
        <div className="w-full rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <div className="flex gap-2 mb-2">
            <Skeleton className="size-4 rounded shrink-0" />
            <Skeleton className="h-5 w-40" />
          </div>
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-3 w-3/4" />
        </div>

        {/* Common reasons card */}
        <div className="w-full rounded-lg border bg-card p-4 text-left">
          <Skeleton className="h-5 w-32 mb-2" />
          <div className="space-y-1">
            {[0, 1, 2, 3].map(i => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>

        {/* Support card */}
        <div className="w-full rounded-lg border bg-card p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="mt-0.5 size-5 rounded shrink-0" />
            <div className="flex-1 text-left space-y-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Skeleton className="h-11 w-full sm:w-auto sm:min-w-[200px] rounded-md" />
          <Skeleton className="h-11 w-full sm:w-auto sm:min-w-[200px] rounded-md" />
        </div>
      </div>
    </div>
  );
}
