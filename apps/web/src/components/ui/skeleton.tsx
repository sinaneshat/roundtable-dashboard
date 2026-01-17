import type { SkeletonUsecase } from '@roundtable/shared';
import { SkeletonUsecases } from '@roundtable/shared';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/ui/cn';

function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('bg-accent animate-pulse rounded-xl', className)}
      {...props}
    />
  );
}

function CardSkeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('rounded-2xl border bg-card p-6 space-y-4', className)} {...props}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-6 w-16" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="flex items-center space-x-4">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    </div>
  );
}

type TableRowSkeletonProps = {
  columns?: number;
} & ComponentProps<'div'>;

function TableRowSkeleton({ columns = 4, className, ...props }: TableRowSkeletonProps) {
  return (
    <div className={cn('flex items-center space-x-4 p-4 border-b', className)} {...props}>
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={i} className={cn('h-4', i === 0 ? 'w-48' : 'w-24')} />
      ))}
    </div>
  );
}

function StatCardSkeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('rounded-2xl border bg-card p-6', className)} {...props}>
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-8 rounded" />
      </div>
      <Skeleton className="h-8 w-20 mb-2" />
      <div className="flex items-center space-x-2">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

function ChartSkeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('rounded-2xl border bg-card p-6', className)} {...props}>
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-1">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="h-32 w-full bg-accent animate-pulse rounded" />
    </div>
  );
}

function PaymentMethodSkeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('rounded-2xl border bg-card p-6 space-y-4', className)} {...props}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded" />
          <div className="space-y-1">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-8 w-8 rounded" />
        </div>
      </div>
      <div className="flex items-center justify-between pt-2 border-t">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  );
}

function SubscriptionSkeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('rounded-2xl border bg-card', className)} {...props}>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      </div>
      <div className="px-6 py-4 bg-accent/50 rounded-b-2xl">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-24 rounded" />
        </div>
      </div>
    </div>
  );
}

function UserMessageSkeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('mb-4 flex justify-end', className)} {...props}>
      <div className="max-w-[80%]">
        <div className="flex items-center gap-3 py-2 mb-2 flex-row-reverse">
          <Skeleton className="size-8 rounded-full bg-white/15" />
          <Skeleton className="h-5 w-24 bg-white/20" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full bg-white/15" />
          <Skeleton className="h-4 w-3/4 bg-white/15" />
        </div>
      </div>
    </div>
  );
}

function AssistantMessageSkeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('mb-4 flex justify-start', className)} {...props}>
      <div className="max-w-[85%]">
        <div className="flex items-center gap-3 py-2 mb-2">
          <Skeleton className="size-8 rounded-full bg-white/15" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-32 bg-white/20" />
            <Skeleton className="h-4 w-20 bg-white/15" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full bg-white/10" />
          <Skeleton className="h-4 w-full bg-white/10" />
          <Skeleton className="h-4 w-5/6 bg-white/10" />
        </div>
      </div>
    </div>
  );
}

function ModeratorCardSkeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('mt-6', className)} {...props}>
      <div className="rounded-2xl bg-card/50 backdrop-blur-sm p-4 space-y-4 border border-white/5">
        <div className="flex items-center gap-2">
          <Skeleton className="size-4 rounded bg-white/15" />
          <Skeleton className="h-4 w-32 bg-white/15" />
          <Skeleton className="h-6 w-20 rounded-full bg-white/10" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-24 bg-white/15" />
          <div className="space-y-1.5">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-3 w-6 bg-white/10" />
                <Skeleton className="h-3 w-full bg-white/10" />
                <Skeleton className="h-3 w-12 bg-white/10" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StickyInputSkeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-30 mt-auto',
        'bg-gradient-to-t from-background via-background to-transparent pt-6',
        className,
      )}
      {...props}
    >
      <div className="w-full max-w-4xl mx-auto px-5 md:px-6">
        <div className="rounded-2xl bg-card border shadow-lg p-4">
          <Skeleton className="h-12 w-full bg-white/10 rounded-xl" />
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-2">
              <Skeleton className="size-6 rounded bg-white/10" />
              <Skeleton className="size-6 rounded bg-white/10" />
            </div>
            <Skeleton className="size-8 rounded-full bg-white/15" />
          </div>
        </div>
      </div>
      <div className="h-4 bg-background" />
    </div>
  );
}

type ThreadMessagesSkeletonProps = {
  participantCount?: number;
  showModerator?: boolean;
  showInput?: boolean;
  usecase?: SkeletonUsecase;
} & ComponentProps<'div'>;

function ThreadMessagesSkeleton({
  participantCount = 2,
  showModerator = true,
  showInput = false,
  usecase,
  className,
  ...props
}: ThreadMessagesSkeletonProps) {
  const shouldShowModerator = usecase === SkeletonUsecases.DEMO ? false : showModerator;
  const shouldShowInput = usecase === SkeletonUsecases.DEMO ? false : showInput;

  return (
    <div className={cn('space-y-3', className)} {...props}>
      <UserMessageSkeleton />
      {Array.from({ length: participantCount }, (_, i) => (
        <AssistantMessageSkeleton key={i} />
      ))}
      {shouldShowModerator && <ModeratorCardSkeleton />}
      {shouldShowInput && <StickyInputSkeleton />}
    </div>
  );
}

function PresetCardSkeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('rounded-2xl border border-border/50 bg-card p-4 space-y-3', className)}
      {...props}
    >
      <div className="flex items-start justify-between gap-2">
        <Skeleton className="h-5 w-32 bg-white/15" />
        <Skeleton className="h-5 w-16 rounded-full bg-white/10" />
      </div>
      <div className="flex items-start gap-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <Skeleton className="size-8 rounded-full bg-white/15" />
            <Skeleton className="h-3 w-10 bg-white/10" />
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-full bg-white/10" />
        <Skeleton className="h-3 w-3/4 bg-white/10" />
      </div>
    </div>
  );
}

type QuickStartSkeletonProps = {
  count?: number;
} & ComponentProps<'div'>;

function QuickStartSkeleton({ count = 3, className, ...props }: QuickStartSkeletonProps) {
  return (
    <div className={cn('flex flex-col', className)} {...props}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={cn('px-4 py-3', i < count - 1 && 'border-b border-white/[0.06]')}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3">
            <Skeleton className="h-4 sm:h-5 w-full sm:w-3/4 bg-white/15" />
            <div className="flex items-center gap-2 shrink-0">
              <Skeleton className="h-6 w-16 rounded-2xl bg-white/10" />
              <div className="flex items-center">
                <div className="flex -space-x-2">
                  <Skeleton className="size-6 rounded-full bg-white/15 relative z-[3]" />
                  <Skeleton className="size-6 rounded-full bg-white/15 relative z-[2]" />
                  <Skeleton className="size-6 rounded-full bg-white/15 relative z-[1]" />
                </div>
                <Skeleton className="size-6 rounded-full bg-white/30 ms-2" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function AuthFormSkeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('w-full flex flex-col gap-4 pt-10', className)} {...props}>
      <Skeleton className="h-12 w-full rounded-full" />
      <Skeleton className="h-12 w-full rounded-full" />
    </div>
  );
}

type PreSearchSkeletonProps = {
  queryCount?: number;
  resultsPerQuery?: number;
} & ComponentProps<'div'>;

function PreSearchSkeleton({
  queryCount = 2,
  resultsPerQuery = 3,
  className,
  ...props
}: PreSearchSkeletonProps) {
  return (
    <div className={cn('space-y-4', className)} {...props}>
      {Array.from({ length: queryCount }, (_, queryIndex) => (
        <div key={queryIndex} className="space-y-2">
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

          <div className="ps-6 space-y-2">
            {Array.from({ length: resultsPerQuery }, (_, resultIndex) => (
              <div key={resultIndex} className="flex items-start gap-2 py-1.5">
                <Skeleton className="size-4 rounded flex-shrink-0" />
                <div className="flex-1 min-w-0 space-y-1">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
            ))}
          </div>

          {queryIndex < queryCount - 1 && (
            <Skeleton className="h-px w-full !mt-4" />
          )}
        </div>
      ))}
    </div>
  );
}

type PreSearchQuerySkeletonProps = {
  resultsPerQuery?: number;
  showSeparator?: boolean;
} & ComponentProps<'div'>;

function PreSearchQuerySkeleton({
  resultsPerQuery = 3,
  showSeparator = false,
  className,
  ...props
}: PreSearchQuerySkeletonProps) {
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

      <div className="ps-6 space-y-2">
        {Array.from({ length: resultsPerQuery }, (_, resultIndex) => (
          <div key={resultIndex} className="flex items-start gap-2 py-1.5">
            <Skeleton className="size-4 rounded flex-shrink-0" />
            <div className="flex-1 min-w-0 space-y-1">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
        ))}
      </div>

      {showSeparator && (
        <Skeleton className="h-px w-full !mt-4" />
      )}
    </div>
  );
}

type PreSearchResultsSkeletonProps = {
  count?: number;
} & ComponentProps<'div'>;

function PreSearchResultsSkeleton({
  count = 3,
  className,
  ...props
}: PreSearchResultsSkeletonProps) {
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
}

export {
  AssistantMessageSkeleton,
  AuthFormSkeleton,
  CardSkeleton,
  ChartSkeleton,
  ModeratorCardSkeleton,
  PaymentMethodSkeleton,
  PreSearchQuerySkeleton,
  PreSearchResultsSkeleton,
  PreSearchSkeleton,
  PresetCardSkeleton,
  QuickStartSkeleton,
  Skeleton,
  StatCardSkeleton,
  StickyInputSkeleton,
  SubscriptionSkeleton,
  TableRowSkeleton,
  ThreadMessagesSkeleton,
  UserMessageSkeleton,
};
