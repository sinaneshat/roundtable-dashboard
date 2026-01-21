import { StatusPageSkeleton } from '@/components/skeletons/status-page-skeleton';

/**
 * Content skeleton for billing failure route
 * Renders INSIDE parent ChatLayoutShell (sidebar + header already provided)
 * Uses shared StatusPageSkeleton for exact layout match
 */
export function BillingFailureSkeleton() {
  return (
    <StatusPageSkeleton
      actionCount={2}
    />
  );
}
