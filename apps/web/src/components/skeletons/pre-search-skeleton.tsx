import type { ComponentProps } from 'react';
import { memo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

type PreSearchSkeletonProps = {
  queryCount?: number;
  resultsPerQuery?: number;
} & ComponentProps<'div'>;

type PreSearchQuerySkeletonProps = {
  resultsPerQuery?: number;
  showSeparator?: boolean;
} & ComponentProps<'div'>;

type PreSearchResultsSkeletonProps = {
  count?: number;
} & ComponentProps<'div'>;

/**
 * PreSearchResultsSkeleton - Result items for a search query
 *
 * Renders the result list under a search query.
 * Can be used independently when adding results incrementally.
 *
 * @param props - Component props
 * @param props.count - Number of result items to render
 * @param props.className - Optional CSS class names
 */
export const PreSearchResultsSkeleton = memo(({
  className,
  count = 3,
  ...props
}: PreSearchResultsSkeletonProps) => {
  return (
    <div className={cn('ps-6 space-y-2', className)} {...props}>
      {Array.from({ length: count }, (_, resultIndex) => (
        <div key={resultIndex} className="flex items-start gap-2 py-1.5">
          <Skeleton className="size-4 rounded flex-shrink-0" />
          <div className="flex-1 min-w-0 space-y-1">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      ))}
    </div>
  );
});

/**
 * PreSearchQuerySkeleton - Single search query with results
 *
 * Matches the structure of a search query block with its result items.
 * Can be used standalone or as part of PreSearchSkeleton.
 *
 * @param props - Component props
 * @param props.resultsPerQuery - Number of result items to show
 * @param props.showSeparator - Whether to show separator line at bottom
 * @param props.className - Optional CSS class names
 */
export const PreSearchQuerySkeleton = memo(({
  className,
  resultsPerQuery = 3,
  showSeparator = false,
  ...props
}: PreSearchQuerySkeletonProps) => {
  return (
    <div className={cn('space-y-2', className)} {...props}>
      <div className="flex items-start gap-2">
        <Skeleton className="size-4 rounded mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-12 rounded-md" />
          </div>
          <Skeleton className="h-3 w-64" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>

      <PreSearchResultsSkeleton count={resultsPerQuery} />

      {showSeparator && <Skeleton className="h-px w-full !mt-4" />}
    </div>
  );
});

/**
 * PreSearchSkeleton - Full skeleton for pre-search results
 *
 * Renders multiple search queries with their results.
 * Used during initial search state or when loading search data.
 *
 * @param props - Component props
 * @param props.queryCount - Number of search query groups to render
 * @param props.resultsPerQuery - Number of result items per query group
 * @param props.className - Optional CSS class names
 */
export const PreSearchSkeleton = memo(({
  className,
  queryCount = 2,
  resultsPerQuery = 3,
  ...props
}: PreSearchSkeletonProps) => {
  return (
    <div className={cn('space-y-4', className)} {...props}>
      {Array.from({ length: queryCount }, (_, queryIndex) => (
        <PreSearchQuerySkeleton
          key={queryIndex}
          resultsPerQuery={resultsPerQuery}
          showSeparator={queryIndex < queryCount - 1}
        />
      ))}
    </div>
  );
});
