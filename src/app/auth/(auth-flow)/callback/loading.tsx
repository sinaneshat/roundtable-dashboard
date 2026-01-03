import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading State for Auth Callback Page
 *
 * Shown during OAuth callback processing and session verification.
 * Minimal centered UI indicating authentication in progress.
 */
export default function AuthCallbackLoading() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="flex flex-col items-center gap-6 text-center">
        {/* Animated spinner skeleton */}
        <div className="relative">
          <Skeleton className="size-12 rounded-full" />
          <div className="absolute inset-0 size-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
        </div>

        {/* Status text */}
        <div className="space-y-2">
          <Skeleton className="h-6 w-40 mx-auto" />
          <Skeleton className="h-4 w-56 mx-auto" />
        </div>
      </div>
    </div>
  );
}
