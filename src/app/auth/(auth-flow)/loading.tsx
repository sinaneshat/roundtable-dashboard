import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading State for Auth Flow Layout
 *
 * Shows skeleton matching AuthShowcaseLayout structure during
 * client-side navigation. Auth redirects handled in middleware.ts.
 */
export default function AuthFlowLoading() {
  return (
    <div className="relative grid h-svh lg:grid-cols-2 overflow-hidden">
      {/* Left side - Auth form area */}
      <div className="relative flex flex-col gap-4 p-6 md:p-10 overflow-y-auto">
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm flex flex-col gap-6">
            {/* Logo skeleton */}
            <Skeleton className="size-28 mx-auto rounded-2xl" />

            {/* Brand text skeleton */}
            <div className="flex flex-col gap-3 text-left">
              <div className="space-y-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-12 w-56" />
              </div>
              <Skeleton className="h-4 w-64" />
            </div>

            {/* Auth buttons skeleton */}
            <div className="flex flex-col gap-4 pt-10">
              <Skeleton className="h-12 w-full rounded-full" />
              <Skeleton className="h-12 w-full rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Demo area (desktop only) */}
      <div className="relative hidden lg:flex lg:flex-col p-4 max-h-svh">
        <div className="flex-1 min-h-0 overflow-hidden rounded-xl border bg-card">
          <div className="flex flex-col h-full px-4 sm:px-6 pt-6 pb-6 space-y-4">
            {/* User message skeleton */}
            <div className="mb-4 flex justify-end">
              <div className="max-w-[80%]">
                <div className="flex items-center gap-3 py-2 mb-2 flex-row-reverse">
                  <Skeleton className="size-8 rounded-full bg-white/15" />
                  <Skeleton className="h-5 w-24 bg-white/20" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full bg-white/15" />
                  <Skeleton className="h-4 w-3/4 bg-white/15" />
                </div>
              </div>
            </div>

            {/* AI messages skeleton */}
            {[0, 1, 2].map(i => (
              <div key={i} className="mb-4 flex justify-start">
                <div className="max-w-[85%]">
                  <div className="flex items-center gap-3 py-2 mb-2">
                    <Skeleton className="size-8 rounded-full bg-white/15" />
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-32 bg-white/20" />
                      <Skeleton className="h-4 w-20 bg-white/15" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full bg-white/10" />
                    <Skeleton className="h-4 w-full bg-white/10" />
                    <Skeleton className="h-4 w-5/6 bg-white/10" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
