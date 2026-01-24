import type { ProjectColor, ProjectIcon } from '@roundtable/shared';
import { DEFAULT_PROJECT_COLOR, DEFAULT_PROJECT_ICON, PROJECT_LIMITS } from '@roundtable/shared';
import { Link, useRouterState } from '@tanstack/react-router';
import { memo, useCallback, useState } from 'react';

import { ChatDeleteDialog } from '@/components/chat/chat-delete-dialog';
import { ChatRenameForm } from '@/components/chat/chat-rename-form';
import { ChatThreadMenuItems } from '@/components/chat/chat-thread-menu-items';
import { Icons } from '@/components/icons';
import { ProjectIconBadge } from '@/components/projects/project-icon-color-picker';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useUpdateThreadMutation } from '@/hooks/mutations';
import { useProjectThreadsQuery } from '@/hooks/queries';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';

export type ProjectListItemData = {
  id: string;
  name: string;
  color: ProjectColor | null;
  icon: ProjectIcon | null;
  threadCount: number;
};

type ProjectListItemProps = {
  project: ProjectListItemData;
  isExpanded: boolean;
  onToggleExpand: (projectId: string) => void;
  onEdit?: (project: ProjectListItemData) => void;
  onDelete?: (project: ProjectListItemData) => void;
  maxThreads?: number;
  onNewThread?: (projectId: string) => void;
};

function ProjectThreadItem({
  thread,
  projectId,
  onShare,
}: {
  thread: { id: string; title: string; slug: string; previousSlug?: string | null };
  projectId: string;
  onShare?: (thread: { id: string; slug: string }) => void;
}) {
  const t = useTranslations();
  const pathname = useRouterState({ select: s => s.location.pathname });
  const slugMatches = (slug: string | null | undefined) =>
    !!slug && (pathname === `/chat/projects/${projectId}/${slug}` || pathname === `/chat/${slug}`);
  const isActive = slugMatches(thread.slug) || slugMatches(thread.previousSlug);
  const [isEditing, setIsEditing] = useState(false);
  const [threadToDelete, setThreadToDelete] = useState<typeof thread | null>(null);

  const updateThreadMutation = useUpdateThreadMutation();

  const handleRename = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleRenameSubmit = useCallback((newTitle: string) => {
    updateThreadMutation.mutate(
      {
        param: { id: thread.id },
        json: { title: newTitle },
      },
      {
        onSettled: () => setIsEditing(false),
      },
    );
  }, [thread.id, updateThreadMutation]);

  const handleRenameCancel = useCallback(() => {
    setIsEditing(false);
  }, []);

  return (
    <>
      <SidebarMenuItem>
        {isEditing
          ? (
              <ChatRenameForm
                initialTitle={thread.title}
                onSubmit={handleRenameSubmit}
                onCancel={handleRenameCancel}
                isPending={updateThreadMutation.isPending}
              />
            )
          : (
              <SidebarMenuButton asChild isActive={isActive}>
                <Link
                  to="/chat/projects/$projectId/$slug"
                  params={{ projectId, slug: thread.slug }}
                  preload="intent"
                >
                  <span className="truncate">{thread.title}</span>
                </Link>
              </SidebarMenuButton>
            )}
        {!isEditing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuAction showOnHover>
                <Icons.moreHorizontal className="size-4" />
                <span className="sr-only">{t('actions.more')}</span>
              </SidebarMenuAction>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start">
              <ChatThreadMenuItems
                onRename={handleRename}
                onShare={onShare ? () => onShare(thread) : undefined}
                onDelete={() => setThreadToDelete(thread)}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </SidebarMenuItem>

      <ChatDeleteDialog
        isOpen={!!threadToDelete}
        onOpenChange={open => !open && setThreadToDelete(null)}
        threadId={threadToDelete?.id ?? ''}
        threadSlug={threadToDelete?.slug}
        projectId={projectId}
        redirectIfCurrent
      />
    </>
  );
}

function ProjectListItemComponent({
  project,
  isExpanded,
  onToggleExpand,
  onDelete,
  maxThreads = PROJECT_LIMITS.MAX_THREADS_PER_PROJECT,
  onNewThread,
}: ProjectListItemProps) {
  const t = useTranslations();
  const pathname = useRouterState({ select: s => s.location.pathname });
  const isActive = pathname.includes(`/projects/${project.id}`);

  const { data: threadsData, isLoading: isLoadingThreads } = useProjectThreadsQuery(
    project.id,
    { enabled: isExpanded },
  );

  const threads = threadsData?.pages.flatMap(page =>
    page.success ? page.data.items : [],
  ) ?? [];

  const sortedThreads = threads;

  const canAddThread = project.threadCount < maxThreads;

  const handleToggle = useCallback(() => {
    onToggleExpand(project.id);
  }, [project.id, onToggleExpand]);

  return (
    <Collapsible open={isExpanded} onOpenChange={handleToggle} className="group/collapsible">
      <SidebarMenuItem>
        <div className="group/item relative">
          <CollapsibleTrigger asChild>
            <SidebarMenuButton
              isActive={isActive}
              className="pr-1 group-hover/item:pr-14 transition-all duration-150"
            >
              <Icons.chevronRight
                className={cn(
                  'size-4 shrink-0 transition-transform duration-200',
                  isExpanded && 'rotate-90',
                )}
              />
              <ProjectIconBadge
                icon={project.icon ?? DEFAULT_PROJECT_ICON}
                color={project.color ?? DEFAULT_PROJECT_COLOR}
                size="sm"
              />
              <span className="truncate flex-1">{project.name}</span>
            </SidebarMenuButton>
          </CollapsibleTrigger>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuAction showOnHover>
                <Icons.moreHorizontal className="size-3.5" />
                <span className="sr-only">{t('actions.more')}</span>
              </SidebarMenuAction>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {onNewThread && (
                <>
                  <DropdownMenuItem
                    onClick={() => onNewThread(project.id)}
                    disabled={!canAddThread}
                  >
                    <Icons.plus className="size-4 mr-2" />
                    {t('projects.newThread')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem asChild>
                <Link to="/chat/projects/$projectId" params={{ projectId: project.id }}>
                  <Icons.pencil className="size-4 mr-2" />
                  {t('actions.edit')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete?.(project)}
                className="text-destructive focus:text-destructive"
              >
                <Icons.trash className="size-4 mr-2" />
                {t('actions.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <CollapsibleContent>
          <SidebarMenu className="mx-3.5 mt-1 border-l border-sidebar-border pl-2 pr-4">
            {isLoadingThreads
              ? (
                  <SidebarMenuItem>
                    <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                      <Icons.loader className="size-3 animate-spin" />
                      {t('common.loading')}
                    </div>
                  </SidebarMenuItem>
                )
              : sortedThreads.length === 0
                ? (
                    <SidebarMenuItem>
                      <div className="flex items-center justify-between px-2 py-1.5">
                        <span className="text-xs text-muted-foreground">
                          {t('projects.threadsEmpty')}
                        </span>
                        {onNewThread && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-5 text-muted-foreground hover:text-foreground"
                            onClick={() => onNewThread(project.id)}
                            disabled={!canAddThread}
                          >
                            <Icons.plus className="size-3.5" />
                            <span className="sr-only">{t('projects.newThread')}</span>
                          </Button>
                        )}
                      </div>
                    </SidebarMenuItem>
                  )
                : (
                    sortedThreads.map(thread => (
                      <ProjectThreadItem
                        key={thread.id}
                        thread={{
                          id: thread.id,
                          title: thread.title,
                          slug: thread.slug,
                          previousSlug: thread.previousSlug,
                        }}
                        projectId={project.id}
                      />
                    ))
                  )}
          </SidebarMenu>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

export const ProjectListItem = memo(ProjectListItemComponent);
