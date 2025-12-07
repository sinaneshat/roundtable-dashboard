import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

type ContentLoadingFallbackProps = {
  className?: string;
};

/**
 * ContentLoadingFallback
 *
 * Generic content loading fallback for layout Suspense boundaries.
 * Shows minimal loading state - route-specific loading.tsx files
 * provide more detailed skeletons with proper structure.
 *
 * Note: No input skeleton here - avoids duplication with route loading.tsx
 *
 * Usage:
 * ```tsx
 * <Suspense fallback={<ContentLoadingFallback />}>
 *   <YourContent />
 * </Suspense>
 * ```
 */
export function ContentLoadingFallback({ className }: ContentLoadingFallbackProps) {
  return (
    <div className={cn('flex flex-col flex-1 min-h-0 items-center justify-center', className)}>
      {/* Minimal loading indicator - route loading.tsx provides detailed skeleton */}
      <div className="flex flex-col items-center gap-6 max-w-3xl w-full mx-auto px-4">
        {/* Simple centered loading skeleton */}
        <Skeleton className="h-20 w-20 rounded-full bg-white/15" />
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="h-8 w-40 bg-white/20" />
          <Skeleton className="h-4 w-64 bg-white/15" />
        </div>
      </div>
    </div>
  );
}
