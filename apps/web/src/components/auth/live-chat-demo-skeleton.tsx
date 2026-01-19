import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton for LiveChatDemo - shows while the demo is loading
 */
export function LiveChatDemoSkeleton() {
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="w-full px-6 py-6 space-y-14">
        {/* User message skeleton */}
        <div className="flex flex-col items-end gap-2">
          <div className="max-w-[85%] ml-auto w-fit bg-secondary rounded-2xl rounded-br-md px-4 py-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-80" />
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
        </div>

        {/* Participant 1 skeleton */}
        <div className="flex justify-start">
          <div className="w-full space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </div>
          </div>
        </div>

        {/* Participant 2 skeleton */}
        <div className="flex justify-start">
          <div className="w-full space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          </div>
        </div>

        {/* Participant 3 skeleton */}
        <div className="flex justify-start">
          <div className="w-full space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-5 w-28 rounded-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
