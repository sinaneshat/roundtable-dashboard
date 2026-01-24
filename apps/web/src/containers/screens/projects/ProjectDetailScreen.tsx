import { zodResolver } from '@hookform/resolvers/zod';
import { ComponentVariants, DEFAULT_PROJECT_COLOR, DEFAULT_PROJECT_ICON, getFileTypeColorClass, UploadStatuses } from '@roundtable/shared';
import type { InfiniteData } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

import { ChatDeleteDialog } from '@/components/chat/chat-delete-dialog';
import { ChatInputDropzoneOverlay, FileTypeIcon } from '@/components/chat/chat-input-attachments';
import { FormProvider } from '@/components/forms';
import { Icons } from '@/components/icons';
import type { ProjectFormValues } from '@/components/projects';
import {
  AttachmentDeleteDialog,
  getProjectFormDefaults,
  MemoryDeleteDialog,
  ProjectDeleteDialog,
  ProjectFormFields,
  ProjectFormSchema,
  ProjectIconBadge,
  ProjectMemoryCard,
  ProjectPendingFileItem,
  ProjectThreadCard,
} from '@/components/projects';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { SmartImage } from '@/components/ui/smart-image';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAddAttachmentToProjectMutation, useUpdateProjectMutation } from '@/hooks/mutations';
import { useDownloadUrlQuery, useProjectAttachmentsQuery, useProjectMemoriesQuery, useProjectQuery, useProjectThreadsQuery } from '@/hooks/queries';
import { useChatAttachments, useDragDrop } from '@/hooks/utils';
import { formatFileSize } from '@/lib/format';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';
import { createSuccessResponse, isAttachmentFromThread } from '@/lib/utils';
import type { GetProjectResponse, ListProjectAttachmentsResponse, ListProjectMemoriesResponse, ListThreadsResponse } from '@/services/api';

type ProjectDetailScreenProps = {
  projectId: string;
  initialProject: GetProjectResponse['data'] | null;
  initialAttachments?: InfiniteData<ListProjectAttachmentsResponse, string | undefined>;
  initialMemories?: InfiniteData<ListProjectMemoriesResponse, string | undefined>;
  initialThreads?: InfiniteData<ListThreadsResponse, string | undefined>;
};

export function ProjectDetailScreen({
  projectId,
  initialProject,
  initialAttachments,
  initialMemories,
  initialThreads,
}: ProjectDetailScreenProps) {
  const t = useTranslations();

  // Use initialProject as initialData to prevent skeleton flash and immediate refetch
  const { data: projectResponse, isLoading } = useProjectQuery(projectId, {
    initialData: initialProject
      ? createSuccessResponse(initialProject)
      : undefined,
  });
  const {
    data: attachmentsData,
    isFetching: isAttachmentsFetching,
    hasNextPage: hasMoreAttachments,
    fetchNextPage: fetchMoreAttachments,
    isFetchingNextPage: isFetchingMoreAttachments,
  } = useProjectAttachmentsQuery(projectId, { initialData: initialAttachments });
  const {
    data: memoriesData,
    isFetching: isMemoriesFetching,
    hasNextPage: hasMoreMemories,
    fetchNextPage: fetchMoreMemories,
    isFetchingNextPage: isFetchingMoreMemories,
  } = useProjectMemoriesQuery(projectId, { initialData: initialMemories });

  // Get project from query response
  const project = projectResponse?.success ? projectResponse.data : null;

  // Only show loading when truly loading (no data at all)
  const showSkeleton = isLoading && !project;

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const attachments = useMemo(() => {
    if (!attachmentsData?.pages)
      return [];
    return attachmentsData.pages.flatMap(page =>
      page.success && page.data?.items ? page.data.items : [],
    );
  }, [attachmentsData]);

  const memories = useMemo(() => {
    if (!memoriesData?.pages)
      return [];
    return memoriesData.pages.flatMap(page =>
      page.success && page.data?.items ? page.data.items : [],
    );
  }, [memoriesData]);

  if (showSkeleton) {
    return <ProjectDetailSkeleton />;
  }

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive">Project not found</h1>
          <p className="text-muted-foreground mt-2">
            The project you are looking for does not exist.
          </p>
          <Button asChild className="mt-4">
            <Link to="/chat">Back to Chat</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      <ScrollArea className="flex-1">
        <div className="p-6 max-w-4xl mx-auto">
          {/* Project Header with Icon */}
          <div className="flex items-center gap-3 mb-6">
            <ProjectIconBadge
              icon={project.icon ?? DEFAULT_PROJECT_ICON}
              color={project.color ?? DEFAULT_PROJECT_COLOR}
              size="xl"
            />
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold truncate max-w-md">{project.name}</h1>
              {project.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{project.description}</p>
              )}
            </div>
          </div>

          <Tabs defaultValue="settings" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="settings">{t('projects.settings')}</TabsTrigger>
              <TabsTrigger value="files">
                {t('projects.files')}
                {attachments.length > 0 && (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    (
                    {attachments.length}
                    )
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="memories">
                {t('projects.memories')}
                {memories.length > 0 && (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    (
                    {memories.length}
                    )
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="threads">
                {t('projects.threads')}
                {(project.threadCount ?? 0) > 0 && (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    (
                    {project.threadCount}
                    )
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="settings">
              <ProjectSettingsSection
                project={project}
                onDelete={() => setIsDeleteDialogOpen(true)}
              />
            </TabsContent>

            <TabsContent value="files">
              <ProjectFilesSection
                projectId={projectId}
                attachments={attachments}
                isLoading={attachments.length === 0 && isAttachmentsFetching}
                hasNextPage={hasMoreAttachments}
                fetchNextPage={fetchMoreAttachments}
                isFetchingNextPage={isFetchingMoreAttachments}
              />
            </TabsContent>

            <TabsContent value="memories">
              <ProjectMemoriesSection
                projectId={projectId}
                memories={memories}
                isLoading={memories.length === 0 && isMemoriesFetching}
                hasNextPage={hasMoreMemories}
                fetchNextPage={fetchMoreMemories}
                isFetchingNextPage={isFetchingMoreMemories}
              />
            </TabsContent>

            <TabsContent value="threads">
              <ProjectThreadsSection projectId={projectId} initialData={initialThreads} />
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>

      <ProjectDeleteDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        project={{ id: project.id, name: project.name }}
      />
    </div>
  );
}

function ProjectDetailSkeleton() {
  return (
    <div className="flex flex-col flex-1">
      <div className="p-6 max-w-4xl mx-auto w-full">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton className="size-12 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-10 w-80 mb-6" />
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    </div>
  );
}

type ProjectSettingsSectionProps = {
  project: NonNullable<GetProjectResponse['data']>;
  onDelete: () => void;
};

function ProjectSettingsSection({ project, onDelete }: ProjectSettingsSectionProps) {
  const t = useTranslations();
  const updateMutation = useUpdateProjectMutation();

  const methods = useForm<ProjectFormValues>({
    resolver: zodResolver(ProjectFormSchema),
    defaultValues: getProjectFormDefaults(project),
    mode: 'onChange',
  });

  const {
    handleSubmit,
    reset,
    control,
    formState: { isDirty, isValid, isSubmitting },
  } = methods;

  // Only reset form when project ID changes (initial load or navigation)
  // Avoid resetting on every query refetch which would clear user edits
  useEffect(() => {
    reset(getProjectFormDefaults(project));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, reset]);

  const onSubmit = useCallback(
    async (values: ProjectFormValues) => {
      await updateMutation.mutateAsync({
        param: { id: project.id },
        json: {
          name: values.name.trim(),
          description: values.description?.trim() || undefined,
          color: values.color,
          icon: values.icon,
          customInstructions: values.customInstructions?.trim() || undefined,
        },
      });
    },
    [project.id, updateMutation],
  );

  const isPending = updateMutation.isPending || isSubmitting;
  const canSubmit = isValid && isDirty && !isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('projects.settings')}</CardTitle>
        <CardDescription>
          {t('projects.editDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FormProvider methods={methods} onSubmit={handleSubmit(onSubmit)}>
          <ProjectFormFields
            control={control}
            disabled={isPending}
            variant="page"
          />

          <div className="flex justify-end pt-6">
            <Button
              type="submit"
              loading={isPending}
              disabled={!canSubmit}
            >
              {t('actions.save')}
            </Button>
          </div>

          {/* Danger Zone */}
          <div className="pt-6 mt-6 border-t border-destructive/20">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-destructive">{t('projects.delete')}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('projects.deleteWarning')}
                </p>
              </div>
              <Button
                type="button"
                variant={ComponentVariants.OUTLINE}
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={onDelete}
                startIcon={<Icons.trash />}
              >
                {t('actions.delete')}
              </Button>
            </div>
          </div>
        </FormProvider>
      </CardContent>
    </Card>
  );
}

type ProjectAttachment = NonNullable<ListProjectAttachmentsResponse['data']>['items'][number];

// File item with image preview and download functionality
function ProjectFileItem({
  attachment,
  onDelete,
}: {
  attachment: ProjectAttachment;
  onDelete: () => void;
}) {
  const t = useTranslations();
  const { upload, ragMetadata } = attachment;
  const isImage = upload.mimeType?.startsWith('image/');
  const isFromThread = isAttachmentFromThread(ragMetadata);

  // Fetch download URL (used for both download and image preview)
  const { data: downloadUrlResult, isLoading: isLoadingUrl } = useDownloadUrlQuery(upload.id, true);
  const downloadUrl = downloadUrlResult?.success ? downloadUrlResult.data.url : null;

  const handleDownload = useCallback(() => {
    if (!downloadUrl)
      return;
    window.open(downloadUrl, '_blank', 'noopener,noreferrer');
  }, [downloadUrl]);

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border/40 hover:bg-muted/60 transition-colors">
      {/* Thumbnail - shows image preview or file type icon */}
      <div
        className={cn(
          'size-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden',
          !isImage && getFileTypeColorClass(upload.mimeType),
        )}
      >
        {isLoadingUrl
          ? (
              <Icons.loader className="size-4 text-muted-foreground animate-spin" />
            )
          : isImage && downloadUrl
            ? (
                <SmartImage
                  src={downloadUrl}
                  alt={upload.filename}
                  fill
                  sizes="40px"
                  unoptimized
                  containerClassName="size-full"
                  fallback={(
                    <div className={cn('size-full flex items-center justify-center', getFileTypeColorClass(upload.mimeType))}>
                      <FileTypeIcon mimeType={upload.mimeType} className="size-4" />
                    </div>
                  )}
                />
              )
            : (
                <FileTypeIcon mimeType={upload.mimeType} className="size-4" />
              )}
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{upload.filename}</p>
          {isFromThread && (
            <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-muted text-muted-foreground">
              <Icons.messageSquare className="size-2.5" />
              {t('projects.fromThread')}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(upload.fileSize)}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleDownload}
          disabled={!downloadUrl || isLoadingUrl}
          className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
          title={t('actions.download')}
        >
          {isLoadingUrl
            ? <Icons.loader className="size-4 animate-spin" />
            : <Icons.download className="size-4" />}
        </button>
        {isFromThread
          ? (
              <span
                className="p-1.5 text-muted-foreground/40 cursor-not-allowed"
                title={t('projects.cannotDeleteThreadFile')}
              >
                <Icons.x className="size-4" />
              </span>
            )
          : (
              <button
                type="button"
                onClick={onDelete}
                className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title={t('actions.remove')}
              >
                <Icons.x className="size-4" />
              </button>
            )}
      </div>
    </div>
  );
}

type ProjectFilesSectionProps = {
  projectId: string;
  attachments: ProjectAttachment[];
  isLoading: boolean;
  hasNextPage?: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
};

function ProjectFilesSection({
  projectId,
  attachments,
  isLoading,
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage,
}: ProjectFilesSectionProps) {
  const t = useTranslations();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; filename: string } | null>(null);

  const {
    attachments: pendingAttachments,
    addFiles,
    removeAttachment: removePendingAttachment,
    isUploading,
    cancelUpload,
  } = useChatAttachments();

  const addToProjectMutation = useAddAttachmentToProjectMutation();

  // Track which upload IDs we've already added to project
  const addedUploadIdsRef = useRef<Set<string>>(new Set());

  // When uploads complete, add them to the project (fire-and-forget)
  useEffect(() => {
    for (const attachment of pendingAttachments) {
      if (
        attachment.status === UploadStatuses.COMPLETED
        && attachment.uploadId
        && !addedUploadIdsRef.current.has(attachment.uploadId)
      ) {
        addedUploadIdsRef.current.add(attachment.uploadId);
        addToProjectMutation.mutate({
          param: { id: projectId },
          json: { uploadId: attachment.uploadId },
        });
        // Immediately remove from pending list - fire and forget
        removePendingAttachment(attachment.id);
      }
    }
  }, [pendingAttachments, projectId, addToProjectMutation, removePendingAttachment]);

  // Filter out completed uploads that are already in project attachments
  const existingUploadIds = useMemo(
    () => new Set(attachments.map(a => a.upload.id)),
    [attachments],
  );

  const visiblePendingAttachments = useMemo(
    () => pendingAttachments.filter(
      pa => !pa.uploadId || !existingUploadIds.has(pa.uploadId),
    ),
    [pendingAttachments, existingUploadIds],
  );

  const { isDragging, dragHandlers } = useDragDrop(addFiles);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) {
      addFiles(files);
    }
    e.target.value = '';
  }, [addFiles]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('projects.files')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasFiles = attachments.length > 0 || visiblePendingAttachments.length > 0;

  return (
    <Card className="relative" {...dragHandlers}>
      <ChatInputDropzoneOverlay isDragging={isDragging} />

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />

      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{t('projects.files')}</CardTitle>
          <CardDescription>
            {t('projects.filesDescription')}
          </CardDescription>
        </div>
        {hasFiles && (
          <Button
            variant={ComponentVariants.OUTLINE}
            size="sm"
            onClick={handleUploadClick}
            disabled={isUploading}
            loading={isUploading}
            startIcon={<Icons.upload />}
          >
            {t('projects.uploadFiles')}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {!hasFiles
          ? (
              <div className="text-center py-8 border-2 border-dashed border-border/50 rounded-xl">
                <Icons.file className="size-12 mx-auto text-muted-foreground/50" />
                <p className="mt-2 text-sm font-medium">{t('projects.filesEmpty')}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('projects.filesEmptyDescription')}
                </p>
                <Button
                  variant={ComponentVariants.OUTLINE}
                  className="mt-4"
                  onClick={handleUploadClick}
                  startIcon={<Icons.upload />}
                >
                  {t('projects.uploadFiles')}
                </Button>
              </div>
            )
          : (
              <div className="space-y-2">
                {/* Pending uploads */}
                {visiblePendingAttachments.map(attachment => (
                  <ProjectPendingFileItem
                    key={attachment.id}
                    attachment={attachment}
                    onCancel={() => {
                      cancelUpload(attachment.id);
                      removePendingAttachment(attachment.id);
                    }}
                    onRemove={() => removePendingAttachment(attachment.id)}
                  />
                ))}

                {/* Existing attachments */}
                {attachments.map(attachment => (
                  <ProjectFileItem
                    key={attachment.id}
                    attachment={attachment}
                    onDelete={() => setDeleteTarget({ id: attachment.id, filename: attachment.upload.filename })}
                  />
                ))}

                {/* Load more button */}
                {hasNextPage && (
                  <Button
                    variant={ComponentVariants.GHOST}
                    size="sm"
                    className="w-full mt-2"
                    onClick={fetchNextPage}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? t('actions.loading') : t('actions.loadMore')}
                  </Button>
                )}
              </div>
            )}
      </CardContent>

      <AttachmentDeleteDialog
        open={!!deleteTarget}
        onOpenChange={open => !open && setDeleteTarget(null)}
        projectId={projectId}
        attachment={deleteTarget}
      />
    </Card>
  );
}

type ProjectMemory = NonNullable<ListProjectMemoriesResponse['data']>['items'][number];

type ProjectMemoriesSectionProps = {
  projectId: string;
  memories: ProjectMemory[];
  isLoading: boolean;
  hasNextPage?: boolean;
  fetchNextPage?: () => void;
  isFetchingNextPage?: boolean;
};

function ProjectMemoriesSection({
  projectId,
  memories,
  isLoading,
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage,
}: ProjectMemoriesSectionProps) {
  const t = useTranslations();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('projects.memories')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t('projects.memories')}</CardTitle>
          <CardDescription>
            {t('projects.memoriesDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {memories.length === 0
            ? (
                <div className="text-center py-8">
                  <Icons.brain className="size-12 mx-auto text-muted-foreground/50" />
                  <p className="mt-2 text-sm font-medium">{t('projects.memoriesEmpty')}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('projects.memoriesAutoGenerated')}
                  </p>
                </div>
              )
            : (
                <div className="space-y-2">
                  {memories.map(memory => (
                    <ProjectMemoryCard
                      key={memory.id}
                      memory={memory}
                      onDelete={() => setDeleteTarget(memory.id)}
                    />
                  ))}
                  {hasNextPage && fetchNextPage && (
                    <Button
                      variant={ComponentVariants.GHOST}
                      size="sm"
                      className="w-full mt-2"
                      onClick={fetchNextPage}
                      disabled={isFetchingNextPage}
                    >
                      {isFetchingNextPage ? t('actions.loading') : t('actions.loadMore')}
                    </Button>
                  )}
                </div>
              )}
        </CardContent>
      </Card>

      <MemoryDeleteDialog
        open={!!deleteTarget}
        onOpenChange={open => !open && setDeleteTarget(null)}
        projectId={projectId}
        memoryId={deleteTarget}
      />
    </>
  );
}

type ProjectThreadsSectionProps = {
  projectId: string;
  initialData?: InfiniteData<ListThreadsResponse, string | undefined>;
};

function ProjectThreadsSection({ projectId, initialData }: ProjectThreadsSectionProps) {
  const t = useTranslations();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; slug: string } | null>(null);
  const {
    data,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useProjectThreadsQuery(projectId, { initialData });

  const threads = data?.pages.flatMap(page => (page.success ? page.data.items : [])) ?? [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('projects.threads')}</CardTitle>
          <Button asChild size="sm" startIcon={<Icons.plus />}>
            <Link to="/chat/projects/$projectId/new" params={{ projectId }}>
              {t('projects.newChat')}
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('projects.threads')}</CardTitle>
          <Button asChild size="sm" startIcon={<Icons.plus />}>
            <Link to="/chat/projects/$projectId/new" params={{ projectId }}>
              {t('projects.newChat')}
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {threads.length === 0
            ? (
                <div className="text-center py-8">
                  <Icons.messagesSquare className="size-12 mx-auto text-muted-foreground/50" />
                  <p className="mt-2 text-sm font-medium">{t('projects.threadsEmpty')}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('projects.threadsEmptyDescription')}
                  </p>
                </div>
              )
            : (
                <div className="space-y-2">
                  {threads.map(thread => (
                    <ProjectThreadCard
                      key={thread.id}
                      thread={thread}
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
              )}
        </CardContent>
      </Card>

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
