import { AuthShowcaseLayout } from '@/components/auth/auth-showcase-layout';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Auth Page Loading Skeleton
 * Used during authentication checks and form loading
 */
export function AuthLoadingSkeleton() {
  return (
    <AuthShowcaseLayout>
      <div className="flex flex-col gap-4 pt-10">
        <Skeleton className="h-14 w-full rounded-full" />
        <Skeleton className="h-14 w-full rounded-full" />
      </div>
    </AuthShowcaseLayout>
  );
}

/**
 * Auth Callback Loading
 * Minimal loading state for OAuth callback
 */
export function AuthCallbackSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <Skeleton className="h-6 w-40 mx-auto mb-2" />
        <Skeleton className="h-4 w-24 mx-auto" />
      </div>
    </div>
  );
}
