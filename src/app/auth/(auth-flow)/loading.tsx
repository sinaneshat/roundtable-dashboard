import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading State for Auth Flow Layout
 *
 * Minimal skeleton for auth pages (sign-in, sign-up).
 * Shows only essential placeholders without the desktop demo area
 * to avoid heavy initial render during auth flow navigation.
 */
export default function AuthFlowLoading() {
  return (
    <div className="relative grid h-svh lg:grid-cols-2 overflow-hidden">
      {/* Left side - Auth form area */}
      <div className="relative flex flex-col gap-4 p-6 md:p-10 overflow-y-auto">
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-md flex flex-col gap-8">
            {/* Logo skeleton */}
            <Skeleton className="size-32 mx-auto rounded-2xl" />

            {/* Brand text skeleton */}
            <div className="flex flex-col gap-3">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-5 w-full" />
            </div>

            {/* Auth buttons skeleton */}
            <div className="flex flex-col gap-4 pt-4">
              <Skeleton className="h-12 w-full rounded-full" />
              <Skeleton className="h-12 w-full rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Empty placeholder (desktop only) */}
      {/* Actual demo content loads with the page, not in loading state */}
      <div className="relative hidden lg:flex lg:flex-col p-6" />
    </div>
  );
}
