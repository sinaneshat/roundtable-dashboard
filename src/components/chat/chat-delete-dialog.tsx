'use client';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useDeleteThreadMutation } from '@/hooks/mutations/chat-mutations';
import { toastManager } from '@/lib/toast/toast-manager';

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
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent glass={true}>
        <AlertDialogHeader glass>
          <AlertDialogTitle>{t('deleteThreadConfirmTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('deleteThreadConfirmDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter glass>
          <AlertDialogCancel disabled={deleteThreadMutation.isPending}>
            {tActions('cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleteThreadMutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteThreadMutation.isPending ? tActions('deleting') : tActions('delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
