'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { EditMessageSchema } from '@/api/routes/chat/schema';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

// ============================================================================
// Form Schema - Reusing Backend Validation
// ============================================================================

/**
 * Edit message form validation schema
 * Reuses backend EditMessageSchema to ensure consistency
 */
type EditMessageFormData = z.infer<typeof EditMessageSchema>;

// ============================================================================
// Component Props
// ============================================================================

type ChatEditDialogProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  initialContent: string;
  onSave: (newContent: string) => void;
  isLoading?: boolean;
};

// ============================================================================
// Component
// ============================================================================

/**
 * Chat Edit Dialog Component
 *
 * Dialog for editing the initial user prompt and regenerating responses
 * Uses react-hook-form for form validation
 */
export function ChatEditDialog({
  isOpen,
  onOpenChange,
  initialContent,
  onSave,
  isLoading = false,
}: ChatEditDialogProps) {
  const t = useTranslations();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<EditMessageFormData>({
    resolver: zodResolver(EditMessageSchema),
    defaultValues: {
      content: initialContent,
    },
  });

  // Reset form when dialog opens with new content
  useEffect(() => {
    if (isOpen) {
      reset({ content: initialContent });
    }
  }, [isOpen, initialContent, reset]);

  const handleFormSubmit = (data: EditMessageFormData) => {
    onSave(data.content);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{t('chat.editMessage.title')}</DialogTitle>
          <DialogDescription>
            {t('chat.editMessage.description')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Textarea
              {...register('content')}
              placeholder={t('chat.input.placeholder')}
              className="min-h-[200px] resize-none"
              disabled={isLoading}
            />
            {errors.content && (
              <p className="text-sm text-destructive">{errors.content.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !isDirty}
              loading={isLoading}
            >
              {t('chat.editMessage.saveAndRegenerate')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
