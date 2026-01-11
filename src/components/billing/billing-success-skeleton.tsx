import { Skeleton } from '@/components/ui/skeleton';

/**
 * Billing Success Page Skeleton
 * Matches BillingSuccessClient structure
 */
export function BillingSuccessSkeleton() {
  return (
    <div className="flex flex-1 min-h-0 w-full flex-col items-center px-4 py-8">
      <div className="flex flex-col items-center gap-6 w-full max-w-md">
        {/* Icon skeleton */}
        <Skeleton className="size-16 rounded-full" />

        {/* Title and description */}
        <div className="space-y-1.5 text-center w-full">
          <Skeleton className="h-7 w-64 mx-auto" />
          <Skeleton className="h-4 w-48 mx-auto" />
        </div>

        {/* Plan overview card skeleton */}
        <div className="w-full rounded-lg border bg-card">
          <div className="p-4 pb-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-4 w-full" />
          </div>
          <div className="p-4 pt-0 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {[0, 1, 2].map(i => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Action buttons skeleton */}
        <div className="flex flex-col gap-2 w-full">
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-8 w-full rounded-md" />
        </div>

        {/* Auto-redirect text */}
        <Skeleton className="h-3 w-48" />
      </div>
    </div>
  );
}
