import { ConfirmationDialogVariants } from '@roundtable/shared';

import { ConfirmationDialog } from '@/components/chat/confirmation-dialog';
import { Icons } from '@/components/icons';
import { useRemoveAttachmentFromProjectMutation } from '@/hooks/mutations';
import { useTranslations } from '@/lib/i18n';
import { toastManager } from '@/lib/toast';

type AttachmentDeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  attachment: { id: string; filename: string } | null;
};

export function AttachmentDeleteDialog({
  attachment,
  onOpenChange,
  open,
  projectId,
}: AttachmentDeleteDialogProps) {
  const t = useTranslations();
  const mutation = useRemoveAttachmentFromProjectMutation();

  const handleConfirm = () => {
    if (!attachment) {
      return;
    }

    mutation.mutate(
      { param: { attachmentId: attachment.id, id: projectId } },
      {
        onError: () => {
          toastManager.error(t('projects.attachmentRemoveError'));
        },
        onSuccess: () => {
          toastManager.success(t('projects.attachmentRemoved'));
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('projects.removeAttachment')}
      description={t('projects.removeAttachmentConfirm', { name: attachment?.filename ?? '' })}
      icon={<Icons.trash className="size-5 text-destructive" />}
      confirmText={t('actions.delete')}
      confirmingText={t('projects.removing')}
      cancelText={t('actions.cancel')}
      isLoading={mutation.isPending}
      variant={ConfirmationDialogVariants.DESTRUCTIVE}
      onConfirm={handleConfirm}
    />
  );
}
