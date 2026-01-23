import { useLocation, useNavigate } from '@tanstack/react-router';

import { ConfirmationDialog } from '@/components/chat/confirmation-dialog';
import { useDeleteThreadMutation } from '@/hooks/mutations';
import { useTranslations } from '@/lib/i18n';
import { toastManager } from '@/lib/toast';

type ChatDeleteDialogProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  threadId: string;
  threadSlug?: string;
  projectId?: string;
  redirectIfCurrent?: boolean;
};

export function ChatDeleteDialog({
  isOpen,
  onOpenChange,
  threadId,
  threadSlug,
  projectId,
  redirectIfCurrent = false,
}: ChatDeleteDialogProps) {
  const t = useTranslations();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const deleteThreadMutation = useDeleteThreadMutation();

  const handleDelete = () => {
    deleteThreadMutation.mutate({ param: { id: threadId }, slug: threadSlug, projectId }, {
      onSuccess: () => {
        toastManager.success(
          t('chat.threadDeleted'),
          t('chat.threadDeletedDescription'),
        );
        if (redirectIfCurrent && threadSlug) {
          if (pathname.includes(`/chat/${threadSlug}`)) {
            navigate({ to: '/chat' });
          }
        }
        onOpenChange(false);
      },
      onError: () => {
        toastManager.error(
          t('chat.threadDeleteFailed'),
          t('chat.threadDeleteFailedDescription'),
        );
      },
    });
  };

  return (
    <ConfirmationDialog
      open={isOpen}
      onOpenChange={onOpenChange}
      title={t('chat.deleteThreadConfirmTitle')}
      description={t('chat.deleteThreadConfirmDescription')}
      confirmText={t('actions.delete')}
      confirmingText={t('actions.deleting')}
      cancelText={t('actions.cancel')}
      isLoading={deleteThreadMutation.isPending}
      variant="destructive"
      onConfirm={handleDelete}
    />
  );
}
