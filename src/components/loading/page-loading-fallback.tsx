import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { cn } from '@/lib/ui/cn';

type PageLoadingFallbackProps = {
  text?: string;
  className?: string;
};

/**
 * PageLoadingFallback
 *
 * Reusable full-page loading state for Suspense boundaries
 * Used for entire page loads (auth, errors, redirects)
 *
 * Features:
 * - Full viewport height
 * - Centered spinner with optional text
 * - Consistent styling across the app
 *
 * Usage:
 * ```tsx
 * <Suspense fallback={<PageLoadingFallback text="Loading..." />}>
 *   <YourComponent />
 * </Suspense>
 * ```
 */
export function PageLoadingFallback({ text = 'Loading...', className }: PageLoadingFallbackProps) {
  return (
    <div className={cn('flex items-center justify-center min-h-screen bg-background', className)}>
      <LoadingSpinner size="md" text={text} />
    </div>
  );
}
