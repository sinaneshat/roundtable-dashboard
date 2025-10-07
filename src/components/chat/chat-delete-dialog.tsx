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
  /**
   * If true and current URL matches thread slug, redirects to /chat after deletion
   */
  redirectIfCurrent?: boolean;
};

/**
 * Reusable delete confirmation dialog
 * Shared between sidebar and thread page
 * Follows same patterns and mutations as sidebar implementation
 */
export function ChatDeleteDialog({
  isOpen,
  onOpenChange,
  threadId,
  threadSlug,
  redirectIfCurrent = false,
}: ChatDeleteDialogProps) {
  const t = useTranslations();
  const router = useRouter();
  const deleteThreadMutation = useDeleteThreadMutation();

  const handleDelete = () => {
    deleteThreadMutation.mutate(threadId, {
      onSuccess: () => {
        // Redirect if current thread is being deleted
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
          t('chat.threadDeleteFailed'),
          t('chat.threadDeleteFailedDescription'),
        );
      },
    });
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('chat.deleteThreadConfirmTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('chat.deleteThreadConfirmDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteThreadMutation.isPending}>
            {t('actions.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleteThreadMutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteThreadMutation.isPending ? t('actions.deleting') : t('actions.delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
