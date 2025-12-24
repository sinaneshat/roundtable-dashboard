import { Skeleton } from '@/components/ui/skeleton';

export default function PricingLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>

      {/* Tabs skeleton */}
      <div className="flex justify-center">
        <Skeleton className="h-10 w-64 rounded-lg" />
      </div>

      {/* Grid skeleton - matches 2 column subscription grid */}
      <div className="w-full max-w-4xl mx-auto">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {[0, 1].map(i => (
            <Skeleton key={i} className="h-80 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
