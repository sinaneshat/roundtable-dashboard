import { Skeleton } from '@/components/ui/skeleton';

export default function AuthFlowLoading() {
  return (
    <div className="w-full">
      <div className="flex flex-col gap-4 pt-10">
        <Skeleton className="h-12 w-full rounded-full" />
        <Skeleton className="h-12 w-full rounded-full" />
      </div>
    </div>
  );
}
