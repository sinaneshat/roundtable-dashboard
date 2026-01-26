import type { AutomatedJobStatus } from '@roundtable/shared/enums';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUpdateJobMutation } from '@/hooks/mutations';
import { useAdminJobsInfiniteQuery } from '@/hooks/queries';
import { adminJobsInfiniteQueryOptions } from '@/lib/data/query-options';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';
import { getJobStatusConfig } from '@/lib/ui/job-status-config';
import type { AutomatedJob } from '@/services/api';

import { JobCreateDialog } from './-components/job-create-dialog';
import { JobDeleteDialog } from './-components/job-delete-dialog';
import { JobDetailDialog } from './-components/job-detail-dialog';
import { TrendDiscoveryDialog } from './-components/trend-discovery-dialog';

export const Route = createFileRoute('/_protected/admin/jobs/')({
  component: JobsListPage,

  loader: async ({ context }) => {
    const { queryClient } = context;

    try {
      await queryClient.ensureInfiniteQueryData(adminJobsInfiniteQueryOptions);
    } catch (error) {
      console.error('[AdminJobs] Loader error:', error);
    }
  },

  staleTime: 0,
});

function JobStatusBadge({ status }: { status: AutomatedJobStatus }) {
  const { icon: StatusIcon, isAnimated, variant } = getJobStatusConfig(status);

  return (
    <Badge variant={variant} className="flex items-center gap-1 shrink-0">
      <StatusIcon className={cn('size-3', isAnimated && 'animate-spin')} />
      {status}
    </Badge>
  );
}

function JobsListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <div className="flex gap-1">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
    </div>
  );
}

function JobCard({
  job,
  onDelete,
  onViewDetails,
}: {
  job: AutomatedJob;
  onDelete: (job: AutomatedJob) => void;
  onViewDetails: (job: AutomatedJob) => void;
}) {
  const t = useTranslations();
  const updateMutation = useUpdateJobMutation();

  const handleRetry = () => {
    updateMutation.mutate({
      json: { status: 'running' as const },
      param: { id: job.id },
    });
  };

  const handleTogglePublic = () => {
    updateMutation.mutate({
      json: { isPublic: true },
      param: { id: job.id },
    });
  };

  const canRetry = job.status === 'failed';
  const progress = job.totalRounds > 0 ? ((job.currentRound + 1) / job.totalRounds) * 100 : 0;
  const progressPercent = Math.round(progress);
  const errorMessage = job.metadata?.errorMessage as string | undefined;

  return (
    <div className="rounded-lg border border-border p-4 space-y-3 hover:bg-muted/20 transition-colors">
      {/* Header: Prompt + Status */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm line-clamp-2">{job.initialPrompt}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span>{new Date(job.createdAt).toLocaleDateString()}</span>
            <span>&middot;</span>
            <span>{t('admin.jobs.roundProgress', { current: job.currentRound + 1, total: job.totalRounds })}</span>
          </div>
        </div>
        <JobStatusBadge status={job.status} />
      </div>

      {/* Model badges + autoPublish */}
      <div className="flex flex-wrap gap-1">
        {job.selectedModels?.map((model: string) => (
          <Badge key={model} variant="secondary" className="text-xs">
            {model.split('/')[1] ?? model}
          </Badge>
        ))}
        {job.autoPublish && (
          <Badge variant="outline" className="text-xs">
            <Icons.globe className="size-3 mr-1" />
            {t('admin.jobs.autoPublish')}
          </Badge>
        )}
      </div>

      {/* Progress bar for running jobs */}
      {job.status === 'running' && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t('admin.jobs.roundProgress', { current: job.currentRound + 1, total: job.totalRounds })}</span>
            <span>
              {progressPercent}
              %
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error message for failed jobs */}
      {job.status === 'failed' && errorMessage && (
        <div className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1.5">
          {errorMessage}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-border">
        <div className="flex items-center gap-2">
          {canRetry && (
            <Button
              variant="default"
              size="sm"
              onClick={handleRetry}
              disabled={updateMutation.isPending}
              startIcon={<Icons.refreshCw />}
            >
              {t('admin.jobs.retry')}
            </Button>
          )}

          {job.threadSlug && (
            <Button variant="outline" size="sm" asChild startIcon={<Icons.messageSquare />}>
              <Link to="/chat/$slug" params={{ slug: job.threadSlug }}>
                {t('admin.jobs.viewThread')}
              </Link>
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1 ml-auto">
          {/* Job details button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onViewDetails(job)}
            aria-label={t('admin.jobs.details')}
          >
            <Icons.info />
          </Button>

          {job.status === 'completed' && job.threadId && !job.isPublic && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleTogglePublic}
              disabled={updateMutation.isPending}
              aria-label={t('admin.jobs.publish')}
            >
              <Icons.globe />
            </Button>
          )}

          {job.status === 'completed' && job.threadSlug && job.isPublic && (
            <Button variant="ghost" size="icon" asChild aria-label={t('accessibility.openPublicThread')}>
              <a
                href={`/public/chat/${job.threadSlug}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icons.externalLink />
              </a>
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(job)}
            className="text-destructive hover:text-destructive"
            aria-label={t('actions.delete')}
          >
            <Icons.trash />
          </Button>
        </div>
      </div>
    </div>
  );
}

type StatusFilter = 'all' | AutomatedJobStatus;

function JobsListPage() {
  const t = useTranslations();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [trendDialogOpen, setTrendDialogOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<AutomatedJob | null>(null);
  const [detailJob, setDetailJob] = useState<AutomatedJob | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isError,
    isFetchingNextPage,
    isLoading,
  } = useAdminJobsInfiniteQuery();

  const allJobs = data?.pages.flatMap(page => page.data.jobs) ?? [];

  // Filter jobs client-side
  const jobs = statusFilter === 'all'
    ? allJobs
    : allJobs.filter(job => job.status === statusFilter);

  // Check if any jobs are actively processing
  const hasActiveJobs = allJobs.some(job => job.status === 'running' || job.status === 'pending');

  // Infinite scroll handler - fetch at 80% scroll
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) {
      return;
    }
    const { clientHeight, scrollHeight, scrollTop } = scrollRef.current;
    const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

    if (scrollPercentage > 0.8 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Setup scroll listener
  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) {
      return;
    }
    viewport.addEventListener('scroll', handleScroll);
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const handleDeleteClick = (job: AutomatedJob) => {
    setJobToDelete(job);
    setDeleteDialogOpen(true);
  };

  const handleViewDetails = (job: AutomatedJob) => {
    setDetailJob(job);
  };

  return (
    <div className="flex flex-1 items-start justify-center p-6">
      <Card className="w-full max-w-2xl">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Icons.sparkles className="size-4" />
                {t('admin.jobs.title')}
                {hasActiveJobs && (
                  <Icons.loader className="size-3 animate-spin text-primary" />
                )}
              </CardTitle>
              <CardDescription>
                {t('admin.jobs.description')}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setTrendDialogOpen(true)} startIcon={<Icons.search />}>
                {t('admin.jobs.trends.title')}
              </Button>
              <Button size="sm" onClick={() => setCreateDialogOpen(true)} startIcon={<Icons.plus />}>
                {t('admin.jobs.create')}
              </Button>
            </div>
          </div>

          {/* Status Filter Tabs */}
          {allJobs.length > 0 && (
            <Tabs value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)} className="mt-4">
              <TabsList className="h-8">
                <TabsTrigger value="all" className="text-xs">{t('admin.jobs.filter.all')}</TabsTrigger>
                <TabsTrigger value="pending" className="text-xs">{t('admin.jobs.filter.pending')}</TabsTrigger>
                <TabsTrigger value="running" className="text-xs">{t('admin.jobs.filter.running')}</TabsTrigger>
                <TabsTrigger value="completed" className="text-xs">{t('admin.jobs.filter.completed')}</TabsTrigger>
                <TabsTrigger value="failed" className="text-xs">{t('admin.jobs.filter.failed')}</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          {/* Loading State */}
          {isLoading && <JobsListSkeleton />}

          {/* Error State */}
          {!isLoading && isError && (
            <div className="text-center py-12">
              <Icons.alertCircle className="size-10 mx-auto text-destructive/50 mb-3" />
              <p className="text-destructive text-sm">{t('admin.jobs.loadError')}</p>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !isError && allJobs.length === 0 && (
            <div className="text-center py-8 border-2 border-dashed border-border/50 rounded-xl">
              <Icons.sparkles className="size-12 mx-auto text-muted-foreground/50" />
              <p className="mt-2 text-sm font-medium">{t('admin.jobs.empty')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('admin.jobs.emptyDescription')}</p>
              <Button className="mt-4" onClick={() => setCreateDialogOpen(true)} startIcon={<Icons.plus />}>
                {t('admin.jobs.create')}
              </Button>
            </div>
          )}

          {/* Filtered Empty State */}
          {!isLoading && !isError && allJobs.length > 0 && jobs.length === 0 && (
            <div className="text-center py-8">
              <Icons.search className="size-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground text-sm">{t('admin.jobs.noFilterResults')}</p>
            </div>
          )}

          {/* Jobs List with Infinite Scroll */}
          {!isLoading && !isError && jobs.length > 0 && (
            <ScrollArea viewportRef={scrollRef} className="h-[60vh] -mr-4 pr-4">
              <div className="space-y-3">
                {jobs.map((job: AutomatedJob) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    onDelete={handleDeleteClick}
                    onViewDetails={handleViewDetails}
                  />
                ))}

                {/* Loading indicator for infinite scroll */}
                {isFetchingNextPage && (
                  <div className="flex justify-center py-4">
                    <Icons.loader className="size-5 animate-spin text-muted-foreground" />
                  </div>
                )}

                {/* End of list indicator */}
                {!hasNextPage && jobs.length > 5 && (
                  <p className="text-center text-xs text-muted-foreground py-4">
                    {t('admin.jobs.endOfList')}
                  </p>
                )}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <JobCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      <JobDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        job={jobToDelete}
      />

      <TrendDiscoveryDialog
        open={trendDialogOpen}
        onOpenChange={setTrendDialogOpen}
      />

      <JobDetailDialog
        job={detailJob}
        open={!!detailJob}
        onOpenChange={open => !open && setDetailJob(null)}
      />
    </div>
  );
}
