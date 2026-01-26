import { Skeleton } from '@/components/ui/skeleton';

type ProjectListSkeletonProps = {
  count?: number;
};

export function ProjectListSkeleton({ count = 3 }: ProjectListSkeletonProps) {
  return (
    <div className="flex flex-col gap-0.5 px-2">
      {Array.from({ length: count }).map((_, index) => (
        <div key={`project-skeleton-${index}`} className="flex items-center gap-2 px-2 py-1.5">
          <Skeleton className="size-3 rounded-full shrink-0" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}
