import { ConfirmationDialogVariants } from '@roundtable/shared';
import { useNavigate } from '@tanstack/react-router';

import { ConfirmationDialog } from '@/components/chat/confirmation-dialog';
import { Icons } from '@/components/icons';
import { useDeleteProjectMutation } from '@/hooks/mutations';
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

export function ProjectDeleteDialog({ onOpenChange, open, project }: ProjectDeleteDialogProps) {
  const t = useTranslations();
  const navigate = useNavigate();
  const deleteMutation = useDeleteProjectMutation();

  const handleConfirm = () => {
    if (!project) {
      return;
    }

    deleteMutation.mutate(
      { param: { id: project.id } },
      {
        onError: () => {
          toastManager.error(t('projects.deleteError'));
        },
        onSuccess: () => {
          toastManager.success(t('projects.deleted'));
          onOpenChange(false);
          navigate({ to: '/chat' });
        },
      },
    );
  };

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('projects.deleteConfirmTitle')}
      description={t('projects.deleteConfirmDescription', { name: project?.name ?? '' })}
      icon={<Icons.trash className="size-5 text-destructive" />}
      confirmText={t('actions.delete')}
      confirmingText={t('actions.deleting')}
      cancelText={t('actions.cancel')}
      isLoading={deleteMutation.isPending}
      variant={ConfirmationDialogVariants.DESTRUCTIVE}
      onConfirm={handleConfirm}
    />
  );
}
