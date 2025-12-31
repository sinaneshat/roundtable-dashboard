import { Skeleton } from '@/components/ui/skeleton';

/**
 * Pricing Page Loading Skeleton
 * Matches PricingContent structure: header, tabs, pricing cards grid
 */
export default function PricingLoading() {
  return (
    <div className="flex flex-1 min-h-0 w-full flex-col">
      {/* Header skeleton */}
      <div className="border-b bg-background/80 backdrop-blur-sm px-4 py-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-32" />
        </div>
        <Skeleton className="h-4 w-64 mt-1" />
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto px-3 sm:px-4 md:px-6 py-6">
          <div className="space-y-8">
            {/* Tabs skeleton */}
            <div className="flex justify-center">
              <Skeleton className="h-10 w-72 rounded-lg" />
            </div>

            {/* Pricing cards grid - 2 column layout */}
            <div className="w-full max-w-4xl mx-auto">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {[0, 1].map(i => (
                  <div key={i} className="rounded-xl border bg-card p-6 space-y-4">
                    {/* Card header */}
                    <div className="space-y-2">
                      <Skeleton className="h-6 w-24" />
                      <Skeleton className="h-4 w-full" />
                    </div>

                    {/* Price */}
                    <div className="flex items-baseline gap-1">
                      <Skeleton className="h-10 w-20" />
                      <Skeleton className="h-4 w-16" />
                    </div>

                    {/* Features list */}
                    <div className="space-y-2 pt-4">
                      {[0, 1, 2, 3].map(j => (
                        <div key={j} className="flex items-center gap-2">
                          <Skeleton className="size-4 rounded-full" />
                          <Skeleton className="h-4 w-full" />
                        </div>
                      ))}
                    </div>

                    {/* CTA button */}
                    <Skeleton className="h-10 w-full rounded-md mt-4" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
