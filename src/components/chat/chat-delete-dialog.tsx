'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { ConfirmationDialog } from '@/components/chat/confirmation-dialog';
import { useDeleteThreadMutation } from '@/hooks/mutations/chat-mutations';
import { toastManager } from '@/lib/toast';

type ChatDeleteDialogProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  threadId: string;
  threadSlug?: string;
  redirectIfCurrent?: boolean;
};

export function ChatDeleteDialog({
  isOpen,
  onOpenChange,
  threadId,
  threadSlug,
  redirectIfCurrent = false,
}: ChatDeleteDialogProps) {
  const t = useTranslations('chat');
  const tActions = useTranslations('actions');
  const router = useRouter();
  const deleteThreadMutation = useDeleteThreadMutation();

  const handleDelete = () => {
    deleteThreadMutation.mutate({ param: { id: threadId } }, {
      onSuccess: () => {
        toastManager.success(
          t('threadDeleted'),
          t('threadDeletedDescription'),
        );
        if (redirectIfCurrent && threadSlug) {
          const currentPath = window.location.pathname;
          if (currentPath.includes(`/chat/${threadSlug}`)) {
            router.push('/chat');
          }
        }
        onOpenChange(false);
      },
      onError: () => {
        toastManager.error(
          t('threadDeleteFailed'),
          t('threadDeleteFailedDescription'),
        );
      },
    });
  };

  return (
    <ConfirmationDialog
      open={isOpen}
      onOpenChange={onOpenChange}
      title={t('deleteThreadConfirmTitle')}
      description={t('deleteThreadConfirmDescription')}
      confirmText={tActions('delete')}
      confirmingText={tActions('deleting')}
      cancelText={tActions('cancel')}
      isLoading={deleteThreadMutation.isPending}
      variant="destructive"
      onConfirm={handleDelete}
    />
  );
}
