'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

import { ComponentVariants } from '@/api/core/enums';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUpdateThreadMutation } from '@/hooks/mutations';

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
  const [title, setTitle] = useState(currentTitle);
  const updateThreadMutation = useUpdateThreadMutation();

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (newOpen) {
        setTitle(currentTitle);
      }
      onOpenChange(newOpen);
    },
    [currentTitle, onOpenChange],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmedTitle = title.trim();
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
    [title, currentTitle, threadId, updateThreadMutation, onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('chat.renameConversation')}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="thread-title" className="sr-only">
              {t('chat.rename')}
            </Label>
            <Input
              id="thread-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t('chat.rename')}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant={ComponentVariants.GHOST}
              onClick={() => onOpenChange(false)}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              type="submit"
              loading={updateThreadMutation.isPending}
              disabled={!title.trim()}
            >
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
