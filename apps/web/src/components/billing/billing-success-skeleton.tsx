import { StatusPageSkeleton } from '@/components/skeletons/status-page-skeleton';

/**
 * Content skeleton for billing success route
 * Renders INSIDE parent ChatLayoutShell (sidebar + header already provided)
 * Uses shared StatusPageSkeleton for exact layout match
 */
export function BillingSuccessSkeleton() {
  return (
    <StatusPageSkeleton
      showPlanInfo
      showRedirectText
      actionCount={1}
    />
  );
}
