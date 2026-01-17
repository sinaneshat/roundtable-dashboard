import { ConfirmationDialog } from '@/components/chat/confirmation-dialog';
import { useDeleteThreadMutation } from '@/hooks/mutations';
import { usePathname, useRouter, useTranslations } from '@/lib/compat';
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
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const deleteThreadMutation = useDeleteThreadMutation();

  const handleDelete = () => {
    deleteThreadMutation.mutate({ param: { id: threadId } }, {
      onSuccess: () => {
        toastManager.success(
          t('chat.threadDeleted'),
          t('chat.threadDeletedDescription'),
        );
        if (redirectIfCurrent && threadSlug) {
          if (pathname.includes(`/chat/${threadSlug}`)) {
            router.push('/chat');
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
