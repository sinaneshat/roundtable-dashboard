import { Skeleton } from '@/components/ui/skeleton';

export function PricingContentSkeleton() {
  return (
    <div className="mx-auto px-3 sm:px-4 md:px-6">
      <div className="space-y-8">
        <div className="w-full max-w-md mx-auto">
          <div className="grid grid-cols-1 gap-6 w-full">
            <div className="rounded-2xl border-2 border-white/20 dark:border-white/10 p-2 md:rounded-3xl md:p-3 shadow-lg">
              <div className="rounded-xl border bg-background/50 backdrop-blur-sm p-6 space-y-6">
                <div className="space-y-2">
                  <Skeleton className="h-7 w-32" />
                  <Skeleton className="h-4 w-full" />
                </div>

                <div className="space-y-2">
                  <div className="flex items-baseline gap-1">
                    <Skeleton className="h-10 w-32" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                </div>

                <div className="space-y-3 flex-1">
                  {[0, 1, 2, 3].map(j => (
                    <div key={j} className="flex items-start gap-3">
                      <Skeleton className="size-5 rounded-full shrink-0 mt-0.5" />
                      <Skeleton className="h-4 w-full" />
                    </div>
                  ))}
                </div>

                <Skeleton className="h-12 w-full rounded-4xl" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
