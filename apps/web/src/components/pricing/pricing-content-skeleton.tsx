import { Skeleton } from '@/components/ui/skeleton';

export function PricingContentSkeleton() {
  return (
    <div className="w-full max-w-md mx-auto px-4 py-8">
      {/* Outer border wrapper - matches PricingCard */}
      <div className="relative h-full rounded-2xl border-2 border-border/30 p-2 md:rounded-3xl md:p-3 shadow-lg">
        {/* Inner card - matches PricingCard inner container */}
        <div className="relative flex h-full flex-col overflow-hidden rounded-xl border border-border/30 bg-background/50 backdrop-blur-sm p-6 dark:shadow-[0px_0px_27px_0px_#2D2D2D]">
          <div className="relative flex flex-1 flex-col gap-6">
            {/* Plan name */}
            <div className="text-center">
              <Skeleton className="h-6 w-24 mx-auto" />
            </div>

            {/* Price */}
            <div className="text-center">
              <div className="flex items-baseline justify-center gap-1">
                <Skeleton className="h-12 w-20" />
                <Skeleton className="h-5 w-14" />
              </div>
            </div>

            {/* Divider */}
            <div className="w-full h-px bg-gradient-to-r from-transparent via-border to-transparent" />

            {/* Value props - 4 items matching PricingCard */}
            <div className="flex-1 space-y-4">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-3">
                  {/* Icon container */}
                  <Skeleton className="size-9 rounded-lg shrink-0" />
                  {/* Text content */}
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>

            {/* CTA button */}
            <div className="pt-2">
              <Skeleton className="h-11 w-full rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
