import { ConfirmationDialogVariants } from '@roundtable/shared';
import { useState } from 'react';

import { ConfirmationDialog } from '@/components/chat/confirmation-dialog';
import { Icons } from '@/components/icons';
import { Checkbox } from '@/components/ui/checkbox';
import { useDeleteJobMutation } from '@/hooks/mutations';
import { useTranslations } from '@/lib/i18n';
import { toastManager } from '@/lib/toast';
import type { AutomatedJob } from '@/services/api';

type JobDeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: AutomatedJob | null;
};

export function JobDeleteDialog({ open, onOpenChange, job }: JobDeleteDialogProps) {
  const t = useTranslations();
  const deleteMutation = useDeleteJobMutation();
  const [deleteThread, setDeleteThread] = useState(false);

  const handleConfirm = () => {
    if (!job)
      return;

    deleteMutation.mutate(
      {
        param: { id: job.id },
        query: { deleteThread: deleteThread ? 'true' : 'false' },
      },
      {
        onSuccess: () => {
          toastManager.success(t('admin.jobs.deleted'));
          onOpenChange(false);
          setDeleteThread(false);
        },
        onError: () => {
          toastManager.error(t('admin.jobs.deleteError'));
        },
      },
    );
  };

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) {
      setDeleteThread(false);
    }
  };

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={t('admin.jobs.deleteConfirmTitle')}
      description={t('admin.jobs.deleteConfirmDescription')}
      icon={<Icons.trash className="size-5 text-destructive" />}
      confirmText={t('actions.delete')}
      confirmingText={t('actions.deleting')}
      cancelText={t('actions.cancel')}
      isLoading={deleteMutation.isPending}
      variant={ConfirmationDialogVariants.DESTRUCTIVE}
      onConfirm={handleConfirm}
    >
      {job?.threadId && (
        <div className="mt-4 flex items-center space-x-2">
          <Checkbox
            id="delete-thread"
            checked={deleteThread}
            onCheckedChange={checked => setDeleteThread(checked === true)}
          />
          <label
            htmlFor="delete-thread"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            {t('admin.jobs.deleteThreadOption')}
          </label>
        </div>
      )}
    </ConfirmationDialog>
  );
}
