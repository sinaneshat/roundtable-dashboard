import { zodResolver } from '@hookform/resolvers/zod';
import { ComponentVariants, STRING_LIMITS } from '@roundtable/shared';
import { useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { FormProvider, RHFTextField } from '@/components/forms';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUpdateThreadMutation } from '@/hooks';
import { useTranslations } from '@/lib/i18n';

const RenameFormSchema = z.object({
  title: z.string().min(STRING_LIMITS.TITLE_MIN).max(STRING_LIMITS.TITLE_MAX).transform(val => val.trim()),
});

type RenameFormValues = z.infer<typeof RenameFormSchema>;

type ChatRenameDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  threadId: string;
  currentTitle: string;
};

export function ChatRenameDialog({
  open,
  onOpenChange,
  threadId,
  currentTitle,
}: ChatRenameDialogProps) {
  const t = useTranslations();
  const updateThreadMutation = useUpdateThreadMutation();

  const methods = useForm<RenameFormValues>({
    resolver: zodResolver(RenameFormSchema),
    defaultValues: { title: currentTitle },
    mode: 'onChange',
  });

  const {
    handleSubmit,
    reset,
    formState: { isDirty, isValid, isSubmitting },
  } = methods;

  useEffect(() => {
    if (open) {
      reset({ title: currentTitle });
    }
  }, [open, currentTitle, reset]);

  const onSubmit = useCallback(
    (values: RenameFormValues) => {
      const trimmedTitle = values.title.trim();

      if (trimmedTitle && trimmedTitle !== currentTitle) {
        updateThreadMutation.mutate(
          {
            param: { id: threadId },
            json: { title: trimmedTitle },
          },
          {
            onSuccess: () => {
              onOpenChange(false);
            },
          },
        );
      } else {
        onOpenChange(false);
      }
    },
    [currentTitle, threadId, updateThreadMutation, onOpenChange],
  );

  const handleClose = useCallback(() => {
    if (updateThreadMutation.isPending)
      return;
    onOpenChange(false);
  }, [updateThreadMutation.isPending, onOpenChange]);

  const isPending = updateThreadMutation.isPending || isSubmitting;
  const canSubmit = isValid && isDirty && !isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('chat.renameConversation')}</DialogTitle>
        </DialogHeader>

        <FormProvider methods={methods} onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
          <DialogBody>
            <RHFTextField<RenameFormValues>
              name="title"
              placeholder={t('chat.rename')}
              disabled={isPending}
            />
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant={ComponentVariants.GHOST}
              onClick={handleClose}
              disabled={isPending}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              type="submit"
              loading={isPending}
              disabled={!canSubmit}
            >
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

export type { ChatRenameDialogProps };
