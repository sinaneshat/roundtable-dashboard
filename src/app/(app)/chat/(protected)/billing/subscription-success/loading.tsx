import { Skeleton } from '@/components/ui/skeleton';

export default function SubscriptionSuccessLoading() {
  return (
    <div className="flex flex-1 min-h-0 w-full flex-col items-center px-4 py-8">
      <div className="flex flex-col items-center gap-6 w-full max-w-md">
        {/* Icon skeleton */}
        <Skeleton className="size-16 rounded-full" />

        {/* Title and description */}
        <div className="space-y-2 text-center w-full">
          <Skeleton className="h-7 w-48 mx-auto" />
          <Skeleton className="h-4 w-64 mx-auto" />
        </div>

        {/* Card skeleton */}
        <div className="w-full space-y-4">
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>

        {/* Actions skeleton */}
        <div className="flex flex-col gap-2 w-full">
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-8 w-32 mx-auto rounded-md" />
        </div>
      </div>
    </div>
  );
}
