import { ComponentVariants, DEFAULT_PROJECT_COLOR, DEFAULT_PROJECT_ICON, PROJECT_LIMITS } from '@roundtable/shared';
import type { InfiniteData } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';

import { ChatDeleteDialog } from '@/components/chat/chat-delete-dialog';
import { Icons } from '@/components/icons';
import {
  LimitReachedDialog,
  ProjectDeleteDialog,
  ProjectIconBadge,
  ProjectSettingsModal,
} from '@/components/projects';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useProjectQuery, useProjectThreadsQuery } from '@/hooks/queries';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';
import { createSuccessResponse } from '@/lib/utils';
import type { GetProjectResponse, ListThreadsResponse } from '@/services/api';

type ProjectDetailScreenProps = {
  projectId: string;
  initialProject: GetProjectResponse['data'] | null;
  initialThreads?: InfiniteData<ListThreadsResponse, string | undefined>;
  openSettings?: boolean;
};

export function ProjectDetailScreen({
  initialProject,
  initialThreads,
  openSettings,
  projectId,
}: ProjectDetailScreenProps) {
  const t = useTranslations();
  const navigate = useNavigate();

  const { data: projectResponse, isLoading } = useProjectQuery(projectId, {
    initialData: initialProject
      ? createSuccessResponse(initialProject)
      : undefined,
  });

  const project = projectResponse?.success ? projectResponse.data : null;
  const showSkeleton = isLoading && !project;

  const [isSettingsOpen, setIsSettingsOpen] = useState(() => Boolean(openSettings));
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isThreadLimitDialogOpen, setIsThreadLimitDialogOpen] = useState(false);

  const threadCount = project?.threadCount ?? 0;
  const isThreadLimitReached = threadCount >= PROJECT_LIMITS.MAX_THREADS_PER_PROJECT;

  // Clear openSettings search param from URL after initial render
  useEffect(() => {
    if (openSettings && project) {
      navigate({
        params: { projectId },
        replace: true,
        search: {},
        to: '/chat/projects/$projectId',
      });
    }
  }, [openSettings, project, navigate, projectId]);

  if (showSkeleton) {
    return <ProjectDetailSkeleton />;
  }

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive">{t('projects.notFound')}</h1>
          <p className="text-muted-foreground mt-2">
            {t('projects.notFoundDescription')}
          </p>
          <Button asChild className="mt-4">
            <Link to="/chat">{t('projects.backToChat')}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      <ScrollArea className="flex-1">
        <div className="p-6 max-w-3xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4 min-w-0">
              <ProjectIconBadge
                icon={project.icon ?? DEFAULT_PROJECT_ICON}
                color={project.color ?? DEFAULT_PROJECT_COLOR}
                size="xl"
              />
              <h1 className="text-2xl font-semibold truncate">{project.name}</h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant={ComponentVariants.OUTLINE}
                size="sm"
                onClick={() => setIsSettingsOpen(true)}
                startIcon={<Icons.slidersHorizontal className="size-4" />}
              >
                {t('projects.settings')}
              </Button>
            </div>
          </div>

          {/* New Chat Section */}
          {isThreadLimitReached
            ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setIsThreadLimitDialogOpen(true)}
                        className={cn(
                          'flex items-center justify-center gap-2 p-4 mb-8 w-full',
                          'rounded-xl border-2 border-dashed border-border/40',
                          'text-muted-foreground/60 cursor-not-allowed',
                          'bg-muted/10',
                        )}
                      >
                        <Icons.plus className="size-5" />
                        <span className="text-base font-medium">
                          {t('projects.newChatIn', { projectName: project.name })}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('projects.threadLimitReachedShort', { max: PROJECT_LIMITS.MAX_THREADS_PER_PROJECT })}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )
            : (
                <Link
                  to="/chat/projects/$projectId/new"
                  params={{ projectId }}
                  className={cn(
                    'flex items-center justify-center gap-2 p-4 mb-8',
                    'rounded-xl border-2 border-dashed border-border/60',
                    'text-muted-foreground hover:text-foreground',
                    'hover:bg-muted/30 hover:border-border transition-all',
                  )}
                >
                  <Icons.plus className="size-5" />
                  <span className="text-base font-medium">
                    {t('projects.newChatIn', { projectName: project.name })}
                  </span>
                </Link>
              )}

          {/* Thread List */}
          <ThreadList
            projectId={projectId}
            initialData={initialThreads}
          />
        </div>
      </ScrollArea>

      {/* Settings Modal */}
      {project && (
        <ProjectSettingsModal
          open={isSettingsOpen}
          onOpenChange={setIsSettingsOpen}
          project={project}
          onDelete={() => {
            setIsSettingsOpen(false);
            setIsDeleteDialogOpen(true);
          }}
        />
      )}

      {/* Delete Dialog */}
      <ProjectDeleteDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        project={{ id: project.id, name: project.name }}
      />

      {/* Thread Limit Dialog */}
      <LimitReachedDialog
        open={isThreadLimitDialogOpen}
        onOpenChange={setIsThreadLimitDialogOpen}
        type="thread"
        max={PROJECT_LIMITS.MAX_THREADS_PER_PROJECT}
      />
    </div>
  );
}

function ProjectDetailSkeleton() {
  return (
    <div className="flex flex-col flex-1">
      <div className="p-6 max-w-3xl mx-auto w-full">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Skeleton className="size-12 rounded-lg" />
            <Skeleton className="h-8 w-48" />
          </div>
          <Skeleton className="h-9 w-24" />
        </div>
        <Skeleton className="h-16 w-full mb-8 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    </div>
  );
}

function ThreadList({
  initialData,
  projectId,
}: {
  projectId: string;
  initialData?: InfiniteData<ListThreadsResponse, string | undefined>;
}) {
  const t = useTranslations();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; slug: string } | null>(null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useProjectThreadsQuery(projectId, { initialData });

  const threads = useMemo(() => {
    return data?.pages.flatMap(page => (page.success ? page.data.items : [])) ?? [];
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="text-center py-12">
        <Icons.messagesSquare className="size-12 mx-auto text-muted-foreground/40" />
        <p className="mt-3 text-sm font-medium text-muted-foreground">
          {t('projects.threadsEmpty')}
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          {t('projects.threadsEmptyDescription')}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="[&>div:hover+div]:border-transparent">
        {threads.map(thread => (
          <ThreadListItem
            key={thread.id}
            thread={thread}
            projectId={projectId}
            onDelete={() => setDeleteTarget({ id: thread.id, slug: thread.slug })}
          />
        ))}

        {hasNextPage && (
          <Button
            variant={ComponentVariants.GHOST}
            size="sm"
            className="w-full mt-2"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? t('actions.loading') : t('actions.loadMore')}
          </Button>
        )}
      </div>

      <ChatDeleteDialog
        isOpen={!!deleteTarget}
        onOpenChange={open => !open && setDeleteTarget(null)}
        threadId={deleteTarget?.id ?? ''}
        threadSlug={deleteTarget?.slug}
        projectId={projectId}
      />
    </>
  );
}

type ThreadItem = {
  id: string;
  title: string;
  slug: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  preview?: string | null;
};

function ThreadListItem({
  onDelete,
  projectId,
  thread,
}: {
  thread: ThreadItem;
  projectId: string;
  onDelete: () => void;
}) {
  const t = useTranslations();

  // Format date like ChatGPT: "Jan 6", "Dec 29"
  const formattedDate = useMemo(() => {
    const date = new Date(thread.updatedAt);
    const now = new Date();
    const isCurrentYear = date.getFullYear() === now.getFullYear();

    if (isCurrentYear) {
      return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    }
    // Show year if different
    return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  }, [thread.updatedAt]);

  return (
    <div className="group relative border-t border-border/50 first:border-t-0 hover:border-transparent">
      <Link
        to="/chat/projects/$projectId/$slug"
        params={{ projectId, slug: thread.slug }}
        preload={false}
        className={cn(
          'flex items-start gap-4 py-4 px-3 -mx-3 rounded-lg',
          'hover:bg-muted/40 transition-colors',
        )}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{thread.title}</p>
          {thread.preview && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{thread.preview}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm text-muted-foreground" suppressHydrationWarning>{formattedDate}</span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete();
            }}
            className={cn(
              'p-1.5 rounded-md',
              'text-muted-foreground hover:text-destructive hover:bg-destructive/10',
              'opacity-0 group-hover:opacity-100 transition-opacity',
            )}
            title={t('chat.deleteThread')}
          >
            <Icons.trash className="size-4" />
          </button>
        </div>
      </Link>
    </div>
  );
}
