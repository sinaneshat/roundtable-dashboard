import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

type ContentLoadingFallbackProps = {
  className?: string;
};

/**
 * ContentLoadingFallback
 *
 * Reusable content area loading state for Suspense boundaries
 * Used for main content areas within layouts
 *
 * Features:
 * - Skeleton placeholder for content
 * - Consistent sizing and spacing
 * - Works within existing layouts
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
    <div className={cn('flex items-center justify-center p-8', className)}>
      <Skeleton className="h-64 w-full max-w-3xl" />
    </div>
  );
}
