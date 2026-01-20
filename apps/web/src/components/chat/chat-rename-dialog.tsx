import { zodResolver } from '@hookform/resolvers/zod';
import { ComponentVariants } from '@roundtable/shared';
import { useCallback, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useUpdateThreadMutation } from '@/hooks/mutations';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';

// Zod schema - single source of truth for validation
const RenameFormSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(255, 'Title must be 255 characters or less')
    .transform(val => val.trim()),
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
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { isDirty, isValid, isSubmitting },
  } = useForm<RenameFormValues>({
    resolver: zodResolver(RenameFormSchema),
    defaultValues: { title: currentTitle },
    mode: 'onChange', // Real-time validation
  });

  // Separate ref from register for proper ref merging
  const { ref: registerRef, ...registerProps } = register('title');

  // Reset form when dialog opens with current title
  useEffect(() => {
    if (open) {
      reset({ title: currentTitle });
      // Focus and select after reset
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [open, currentTitle, reset]);

  const onSubmit = useCallback(
    (values: RenameFormValues) => {
      // Schema already trims, but double-check
      const trimmedTitle = values.title.trim();

      // Only submit if actually changed
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
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{t('chat.renameConversation')}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="thread-title" className="sr-only">
              {t('chat.rename')}
            </Label>
            <input
              id="thread-title"
              {...registerProps}
              ref={(e) => {
                registerRef(e);
                inputRef.current = e;
              }}
              type="text"
              placeholder={t('chat.rename')}
              disabled={isPending}
              className={cn(
                'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-10 sm:h-9 w-full min-w-0 rounded-4xl border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,border-color] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
                'focus-visible:border-ring',
              )}
            />
          </div>
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
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type { ChatRenameDialogProps };
