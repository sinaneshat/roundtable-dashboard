import { useLocation, useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';

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

  // Auto-detect projectId from URL if not provided (matches /chat/projects/{projectId}/{slug})
  const projectIdFromUrl = useMemo(() => {
    const match = pathname.match(/^\/chat\/projects\/([^/]+)\//);
    return match?.[1] ?? null;
  }, [pathname]);

  const effectiveProjectId = projectId ?? projectIdFromUrl;

  const handleDelete = () => {
    deleteThreadMutation.mutate({ param: { id: threadId }, slug: threadSlug, projectId }, {
      onSuccess: () => {
        toastManager.success(
          t('chat.threadDeleted'),
          t('chat.threadDeletedDescription'),
        );
        if (redirectIfCurrent && threadSlug && pathname.endsWith(`/${threadSlug}`)) {
          if (effectiveProjectId) {
            navigate({ to: '/chat/projects/$projectId/new', params: { projectId: effectiveProjectId } });
          } else {
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
