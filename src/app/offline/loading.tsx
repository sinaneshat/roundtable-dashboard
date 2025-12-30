import { Skeleton } from '@/components/ui/skeleton';

export default function OfflineLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4">
      <div className="mx-auto flex max-w-md flex-col items-center space-y-8 text-center">
        {/* Icon */}
        <div className="rounded-full bg-slate-800/50 p-8">
          <Skeleton className="size-16 rounded-full bg-slate-700" />
        </div>

        {/* Heading */}
        <div className="space-y-3 w-full">
          <Skeleton className="h-10 w-56 mx-auto bg-slate-800" />
          <Skeleton className="h-5 w-full bg-slate-800" />
          <Skeleton className="h-5 w-4/5 mx-auto bg-slate-800" />
        </div>

        {/* Status message box */}
        <div className="w-full rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-full bg-slate-800" />
            <Skeleton className="h-4 w-3/4 mx-auto bg-slate-800" />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex w-full flex-col gap-3 sm:flex-row">
          <Skeleton className="h-11 flex-1 rounded-md bg-slate-800" />
          <Skeleton className="h-11 flex-1 rounded-md bg-slate-800" />
        </div>

        {/* Tips section */}
        <div className="space-y-2 w-full">
          <Skeleton className="h-4 w-36 bg-slate-800" />
          <div className="space-y-1.5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-4 w-full bg-slate-800" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
