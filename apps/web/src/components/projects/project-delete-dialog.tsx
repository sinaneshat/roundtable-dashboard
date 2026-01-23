import { ConfirmationDialogVariants } from '@roundtable/shared';
import { useNavigate } from '@tanstack/react-router';

import { ConfirmationDialog } from '@/components/chat/confirmation-dialog';
import { Icons } from '@/components/icons';
import { useDeleteProjectMutation } from '@/hooks/mutations';
import { useProjectThreadsQuery } from '@/hooks/queries';
import { useTranslations } from '@/lib/i18n';
import { toastManager } from '@/lib/toast';

type ProjectDeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: {
    id: string;
    name: string;
  } | null;
};

export function ProjectDeleteDialog({ open, onOpenChange, project }: ProjectDeleteDialogProps) {
  const t = useTranslations();
  const navigate = useNavigate();
  const deleteMutation = useDeleteProjectMutation();

  // Fetch threads when dialog opens
  const { data: threadsData, isLoading: isLoadingThreads } = useProjectThreadsQuery(
    project?.id ?? '',
    open && !!project,
  );

  const threads = threadsData?.pages.flatMap(page =>
    page.success ? page.data.items : [],
  ) ?? [];

  const handleConfirm = () => {
    if (!project)
      return;

    deleteMutation.mutate(
      { param: { id: project.id } },
      {
        onSuccess: () => {
          toastManager.success(t('projects.deleted'));
          onOpenChange(false);
          navigate({ to: '/chat' });
        },
        onError: () => {
          toastManager.error(t('projects.deleteError'));
        },
      },
    );
  };

  // Build description based on thread count
  const description = threads.length > 0
    ? t('projects.deleteConfirmWithThreads', {
        name: project?.name ?? '',
        count: threads.length,
      })
    : `${t('projects.deleteConfirmDescription', { name: project?.name ?? '' })}`;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('projects.deleteConfirmTitle')}
      description={description}
      icon={<Icons.trash className="size-5 text-destructive" />}
      confirmText={t('actions.delete')}
      confirmingText={t('actions.deleting')}
      cancelText={t('actions.cancel')}
      isLoading={deleteMutation.isPending || isLoadingThreads}
      variant={ConfirmationDialogVariants.DESTRUCTIVE}
      onConfirm={handleConfirm}
    >
      {threads.length > 0 && (
        <div className="mt-2 max-h-40 overflow-y-auto rounded-md border bg-muted/50 p-3">
          <p className="mb-2 text-sm font-medium">
            {t('projects.threadsToDelete', { count: threads.length })}
          </p>
          <ul className="space-y-1">
            {threads.slice(0, 10).map(thread => (
              <li key={thread.id} className="truncate text-sm text-muted-foreground">
                {thread.title}
              </li>
            ))}
            {threads.length > 10 && (
              <li className="text-sm italic text-muted-foreground">
                {t('projects.andMoreThreads', { count: threads.length - 10 })}
              </li>
            )}
          </ul>
        </div>
      )}
    </ConfirmationDialog>
  );
}
