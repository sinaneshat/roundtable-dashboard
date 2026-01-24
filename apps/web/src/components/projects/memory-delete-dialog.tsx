import { ConfirmationDialogVariants } from '@roundtable/shared';

import { ConfirmationDialog } from '@/components/chat/confirmation-dialog';
import { Icons } from '@/components/icons';
import { useDeleteProjectMemoryMutation } from '@/hooks/mutations';
import { useTranslations } from '@/lib/i18n';
import { toastManager } from '@/lib/toast';

type MemoryDeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  memoryId: string | null;
};

export function MemoryDeleteDialog({
  open,
  onOpenChange,
  projectId,
  memoryId,
}: MemoryDeleteDialogProps) {
  const t = useTranslations();
  const mutation = useDeleteProjectMemoryMutation();

  const handleConfirm = () => {
    if (!memoryId)
      return;

    mutation.mutate(
      { param: { id: projectId, memoryId } },
      {
        onSuccess: () => {
          toastManager.success(t('projects.memoryRemoved'));
          onOpenChange(false);
        },
        onError: () => {
          toastManager.error(t('projects.memoryRemoveError'));
        },
      },
    );
  };

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('projects.removeMemory')}
      description={t('projects.removeMemoryConfirm')}
      icon={<Icons.trash className="size-5 text-destructive" />}
      confirmText={t('actions.delete')}
      confirmingText={t('actions.deleting')}
      cancelText={t('actions.cancel')}
      isLoading={mutation.isPending}
      variant={ConfirmationDialogVariants.DESTRUCTIVE}
      onConfirm={handleConfirm}
    />
  );
}
