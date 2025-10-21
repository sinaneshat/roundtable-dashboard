import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

type ContentLoadingFallbackProps = {
  className?: string;
};

/**
 * ContentLoadingFallback
 *
 * Reusable content area loading state for Suspense boundaries
 * Used for main content areas within chat layouts
 *
 * Features:
 * - Matches actual content container sizing and padding
 * - Consistent with ChatOverviewScreen and ChatThreadScreen layouts
 * - Uses container pattern: max-w-3xl, mx-auto, px-4 sm:px-6
 * - Window-level scrolling compatible
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
    <div className={cn('min-h-svh flex flex-col', className)}>
      {/* ✅ EXACT MATCH: container max-w-3xl mx-auto px-4 sm:px-6 pt-0 pb-32 */}
      <div className="container max-w-3xl mx-auto px-4 sm:px-6 pt-0 pb-32">
        {/* Center-aligned skeleton matching ChatOverviewScreen initial UI */}
        <div className="flex flex-col items-center gap-4 sm:gap-6 text-center pt-20">
          {/* Logo skeleton - matches: h-20 w-20 xs:h-24 xs:w-24 sm:h-28 sm:w-28 md:h-32 md:w-32 lg:h-36 lg:w-36 */}
          <Skeleton className="h-20 w-20 xs:h-24 xs:w-24 sm:h-28 sm:w-28 md:h-32 md:w-32 lg:h-36 lg:w-36 rounded-full" />

          {/* Title skeleton - matches: text-2xl xs:text-3xl sm:text-4xl md:text-5xl lg:text-6xl */}
          <Skeleton className="h-8 sm:h-10 md:h-12 lg:h-14 w-64 sm:w-80 md:w-96" />

          {/* Tagline skeleton - matches: text-base xs:text-lg sm:text-xl md:text-2xl max-w-2xl */}
          <Skeleton className="h-6 sm:h-7 md:h-8 w-80 sm:w-96 md:w-[32rem] max-w-2xl" />

          {/* Quick start suggestions skeleton - spacing matches: mt-4 sm:mt-6 md:mt-8 */}
          <div className="w-full mt-4 sm:mt-6 md:mt-8 space-y-3">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
