import { Skeleton } from '@/components/ui/skeleton';

export default function RootLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Skeleton className="size-16 rounded-full" />
        <Skeleton className="h-5 w-32" />
      </div>
    </div>
  );
}
