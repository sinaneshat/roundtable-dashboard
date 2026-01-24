import { zodResolver } from '@hookform/resolvers/zod';
import { ComponentVariants, DEFAULT_PROJECT_COLOR, DEFAULT_PROJECT_ICON, getFileTypeColorClass, PROJECT_COLORS, PROJECT_ICONS, STRING_LIMITS, UploadStatuses } from '@roundtable/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { ChatInputDropzoneOverlay, FileTypeIcon } from '@/components/chat/chat-input-attachments';
import { Icons } from '@/components/icons';
import { ProjectIconBadge, ProjectIconColorPicker } from '@/components/projects/project-icon-color-picker';
import { ProjectPendingFileItem } from '@/components/projects/project-pending-file-item';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SmartImage } from '@/components/ui/smart-image';
import { Textarea } from '@/components/ui/textarea';
import { useAddAttachmentToProjectMutation, useRemoveAttachmentFromProjectMutation, useUpdateProjectMutation } from '@/hooks/mutations';
import { useDownloadUrlQuery, useProjectAttachmentsQuery } from '@/hooks/queries';
import { useChatAttachments, useDragDrop } from '@/hooks/utils';
import { formatFileSize } from '@/lib/format';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';
import { isAttachmentFromThread } from '@/lib/utils';
import type { GetProjectResponse, ListProjectAttachmentsResponse } from '@/services/api';

const ProjectSettingsSchema = z.object({
  name: z.string().min(STRING_LIMITS.PROJECT_NAME_MIN, 'Name is required').max(STRING_LIMITS.PROJECT_NAME_MAX),
  color: z.enum(PROJECT_COLORS),
  icon: z.enum(PROJECT_ICONS),
  customInstructions: z.string().max(STRING_LIMITS.CUSTOM_INSTRUCTIONS_MAX).optional(),
});

type ProjectSettingsFormValues = z.infer<typeof ProjectSettingsSchema>;

type ProjectSettingsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: NonNullable<GetProjectResponse['data']>;
  onDelete: () => void;
};

export function ProjectSettingsModal({
  open,
  onOpenChange,
  project,
  onDelete,
}: ProjectSettingsModalProps) {
  const t = useTranslations();
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateMutation = useUpdateProjectMutation();
  const addToProjectMutation = useAddAttachmentToProjectMutation();

  // Attachments
  const { data: attachmentsData, isFetching: isAttachmentsFetching } = useProjectAttachmentsQuery(project.id);

  const attachments = useMemo(() => {
    if (!attachmentsData?.pages)
      return [];
    return attachmentsData.pages.flatMap(page =>
      page.success && page.data?.items ? page.data.items : [],
    );
  }, [attachmentsData]);

  const {
    attachments: pendingAttachments,
    addFiles,
    removeAttachment: removePendingAttachment,
    isUploading,
    cancelUpload,
  } = useChatAttachments();

  // Track which upload IDs we've already added to project
  const addedUploadIdsRef = useRef<Set<string>>(new Set());

  // When uploads complete, add them to the project
  // Don't remove pending attachment here - visiblePendingAttachments filters it out
  // once it appears in the fetched attachments list, preventing flash
  useEffect(() => {
    for (const attachment of pendingAttachments) {
      if (
        attachment.status === UploadStatuses.COMPLETED
        && attachment.uploadId
        && !addedUploadIdsRef.current.has(attachment.uploadId)
      ) {
        addedUploadIdsRef.current.add(attachment.uploadId);
        addToProjectMutation.mutate({
          param: { id: project.id },
          json: { uploadId: attachment.uploadId },
        });
      }
    }
  }, [pendingAttachments, project.id, addToProjectMutation]);

  // Filter out completed uploads
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

  const form = useForm<ProjectSettingsFormValues>({
    resolver: zodResolver(ProjectSettingsSchema),
    defaultValues: {
      name: project.name,
      color: project.color ?? DEFAULT_PROJECT_COLOR,
      icon: project.icon ?? DEFAULT_PROJECT_ICON,
      customInstructions: project.customInstructions ?? '',
    },
    mode: 'onChange',
  });

  const {
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { isValid, isSubmitting },
  } = form;

  const currentIcon = watch('icon');
  const currentColor = watch('color');
  const currentName = watch('name');
  const currentInstructions = watch('customInstructions');

  useEffect(() => {
    if (open) {
      reset({
        name: project.name,
        color: project.color ?? DEFAULT_PROJECT_COLOR,
        icon: project.icon ?? DEFAULT_PROJECT_ICON,
        customInstructions: project.customInstructions ?? '',
      });
      addedUploadIdsRef.current = new Set();
    }
  }, [open, project, reset]);

  const onSubmit = useCallback(
    async (values: ProjectSettingsFormValues) => {
      try {
        await updateMutation.mutateAsync({
          param: { id: project.id },
          json: {
            name: values.name.trim(),
            color: values.color,
            icon: values.icon,
            customInstructions: values.customInstructions?.trim() || undefined,
          },
        });
        onOpenChange(false);
      } catch {
        // Error handled by mutation
      }
    },
    [project.id, updateMutation, onOpenChange],
  );

  const handleClose = useCallback(() => {
    if (updateMutation.isPending)
      return;
    onOpenChange(false);
  }, [updateMutation.isPending, onOpenChange]);

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

  const isPending = updateMutation.isPending || isSubmitting;

  // Manual dirty check - react-hook-form's isDirty can be unreliable with setValue
  const originalIcon = project.icon ?? DEFAULT_PROJECT_ICON;
  const originalColor = project.color ?? DEFAULT_PROJECT_COLOR;
  const hasChanges
    = currentName !== project.name
      || currentIcon !== originalIcon
      || currentColor !== originalColor
      || (currentInstructions ?? '') !== (project.customInstructions ?? '');

  const canSubmit = isValid && hasChanges && !isPending;

  const hasFiles = attachments.length > 0 || visiblePendingAttachments.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px] h-[85vh] max-h-[700px]" {...dragHandlers}>
        <ChatInputDropzoneOverlay isDragging={isDragging} />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
        />

        <DialogHeader>
          <DialogTitle>{t('projects.projectSettings')}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
            <DialogBody>
              <ScrollArea className="h-full">
                <div className="space-y-6 pr-4">
                  {/* Project name */}
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('projects.name')}</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Popover open={isIconPickerOpen} onOpenChange={setIsIconPickerOpen}>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className="absolute left-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-accent/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                                >
                                  <ProjectIconBadge
                                    icon={currentIcon}
                                    color={currentColor}
                                    size="md"
                                  />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent
                                side="bottom"
                                align="start"
                                className="w-[280px] p-4"
                                sideOffset={8}
                              >
                                <ProjectIconColorPicker
                                  icon={currentIcon}
                                  color={currentColor}
                                  onIconChange={icon => setValue('icon', icon, { shouldDirty: true, shouldValidate: true })}
                                  onColorChange={color => setValue('color', color, { shouldDirty: true, shouldValidate: true })}
                                />
                              </PopoverContent>
                            </Popover>
                            <Input
                              {...field}
                              placeholder={t('projects.namePlaceholder')}
                              className="pl-11"
                              disabled={isPending}
                            />
                          </div>
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {/* Instructions */}
                  <FormField
                    control={form.control}
                    name="customInstructions"
                    render={({ field }) => (
                      <FormItem>
                        <div className="space-y-1">
                          <FormLabel>{t('projects.instructionsLabel')}</FormLabel>
                          <p className="text-sm text-muted-foreground">
                            {t('projects.customInstructionsHint')}
                          </p>
                        </div>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder={t('projects.instructionsPlaceholder')}
                            rows={3}
                            disabled={isPending}
                            className="resize-y min-h-[80px]"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {/* Files */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{t('projects.files')}</span>
                      <Button
                        type="button"
                        variant={ComponentVariants.OUTLINE}
                        size="sm"
                        onClick={handleUploadClick}
                        disabled={isUploading}
                        startIcon={isUploading
                          ? <Icons.loader className="size-4 animate-spin" />
                          : <Icons.plus className="size-4" />}
                      >
                        {t('actions.add')}
                      </Button>
                    </div>

                    <div className="min-h-[140px]">
                      {!hasFiles && !isAttachmentsFetching
                        ? (
                            <button
                              type="button"
                              className="w-full text-center py-8 border border-dashed border-border/50 rounded-xl cursor-pointer hover:bg-muted/30 transition-colors"
                              onClick={handleUploadClick}
                            >
                              <Icons.upload className="size-6 mx-auto text-muted-foreground/60" />
                              <p className="mt-3 text-sm text-muted-foreground px-4">
                                {t('projects.filesEmptyHint', { projectName: project.name })}
                              </p>
                            </button>
                          )
                        : (
                            <div className="space-y-2">
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
                              {attachments.map(attachment => (
                                <SettingsFileItem
                                  key={attachment.id}
                                  projectId={project.id}
                                  attachment={attachment}
                                />
                              ))}
                            </div>
                          )}
                    </div>
                  </div>

                  {/* Delete section */}
                  <div className="pt-6">
                    <Button
                      type="button"
                      variant={ComponentVariants.OUTLINE}
                      className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50"
                      onClick={onDelete}
                    >
                      {t('projects.delete')}
                    </Button>
                  </div>
                </div>
              </ScrollArea>
            </DialogBody>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={handleClose}
                disabled={isPending}
              >
                {t('actions.cancel')}
              </Button>
              <Button
                type="submit"
                loading={isPending}
                disabled={!canSubmit}
              >
                {t('actions.save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

type ProjectAttachment = NonNullable<ListProjectAttachmentsResponse['data']>['items'][number];

function SettingsFileItem({
  projectId,
  attachment,
}: {
  projectId: string;
  attachment: ProjectAttachment;
}) {
  const t = useTranslations();
  const { upload, ragMetadata } = attachment;
  const isImage = upload.mimeType?.startsWith('image/');
  const isFromThread = isAttachmentFromThread(ragMetadata);

  const deleteMutation = useRemoveAttachmentFromProjectMutation();

  const { data: downloadUrlResult, isLoading: isLoadingUrl } = useDownloadUrlQuery(upload.id, true);
  const downloadUrl = downloadUrlResult?.success ? downloadUrlResult.data.url : null;

  const handleDelete = useCallback(() => {
    deleteMutation.mutate({
      param: { id: projectId, attachmentId: attachment.id },
    });
  }, [deleteMutation, projectId, attachment.id]);

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40 border border-border/40">
      <div
        className={cn(
          'size-8 rounded-md flex items-center justify-center shrink-0 overflow-hidden',
          !isImage && getFileTypeColorClass(upload.mimeType),
        )}
      >
        {isLoadingUrl
          ? (
              <Icons.loader className="size-3 text-muted-foreground animate-spin" />
            )
          : isImage && downloadUrl
            ? (
                <SmartImage
                  src={downloadUrl}
                  alt={upload.filename}
                  fill
                  sizes="32px"
                  unoptimized
                  containerClassName="size-full"
                  fallback={(
                    <div className={cn('size-full flex items-center justify-center', getFileTypeColorClass(upload.mimeType))}>
                      <FileTypeIcon mimeType={upload.mimeType} className="size-3" />
                    </div>
                  )}
                />
              )
            : (
                <FileTypeIcon mimeType={upload.mimeType} className="size-3" />
              )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{upload.filename}</p>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(upload.fileSize)}
          {isFromThread && (
            <span className="ml-2 text-muted-foreground/70">
              •
              {' '}
              {t('projects.fromThread')}
            </span>
          )}
        </p>
      </div>

      {!isFromThread && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          title={t('actions.remove')}
        >
          {deleteMutation.isPending
            ? <Icons.loader className="size-4 animate-spin" />
            : <Icons.x className="size-4" />}
        </button>
      )}
    </div>
  );
}

export type { ProjectSettingsModalProps };
