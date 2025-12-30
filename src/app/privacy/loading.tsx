import { Skeleton } from '@/components/ui/skeleton';

export default function PrivacyLoading() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Back button */}
      <div className="mb-8">
        <Skeleton className="h-9 w-20 rounded-md" />
      </div>

      {/* Card */}
      <div className="rounded-xl border bg-card">
        {/* Card header */}
        <div className="p-6 space-y-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-36" />
        </div>

        {/* Card content - sections */}
        <div className="px-6 pb-6 space-y-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-6 w-40" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
