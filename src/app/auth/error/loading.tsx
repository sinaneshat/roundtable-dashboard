import { Skeleton } from '@/components/ui/skeleton';

export default function AuthErrorLoading() {
  return (
    <div className="w-full max-w-sm mx-auto flex flex-col items-center gap-6">
      {/* Icon */}
      <Skeleton className="size-16 rounded-full" />

      {/* Title and description */}
      <div className="space-y-3 text-center w-full">
        <Skeleton className="h-7 w-48 mx-auto" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4 mx-auto" />
      </div>

      {/* Error code badge area */}
      <div className="w-full rounded-lg bg-muted p-3">
        <div className="flex items-center justify-center gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-2 w-full">
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
    </div>
  );
}
