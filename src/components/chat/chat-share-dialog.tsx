'use client';

import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUpdateThreadMutation } from '@/hooks/mutations/chat-mutations';
import { toastManager } from '@/lib/toast/toast-manager';

type ChatShareDialogProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  threadId: string;
  threadSlug: string;
  isPublic: boolean;
};

/**
 * Share dialog for making threads public
 * Confirms action, then shows share URL for copying
 */
export function ChatShareDialog({
  isOpen,
  onOpenChange,
  threadId,
  threadSlug,
  isPublic,
}: ChatShareDialogProps) {
  const t = useTranslations();
  const updateThreadMutation = useUpdateThreadMutation();
  const [showShareUrl, setShowShareUrl] = useState(isPublic);
  const [copied, setCopied] = useState(false);

  // Generate share URL
  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/chat/${threadSlug}`
    : '';

  const handleMakePublic = () => {
    updateThreadMutation.mutate(
      {
        threadId,
        data: { json: { isPublic: true } },
      },
      {
        onSuccess: () => {
          toastManager.success(
            t('chat.madePublic'),
            t('chat.madePublicDescription'),
          );
          setShowShareUrl(true);
        },
        onError: () => {
          toastManager.error(
            t('chat.updateFailed'),
            t('chat.updateFailedDescription'),
          );
          onOpenChange(false);
        },
      },
    );
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toastManager.success(
        t('chat.linkCopied'),
        t('chat.linkCopiedDescription'),
      );
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toastManager.error(
        t('chat.copyFailed'),
        t('chat.copyFailedDescription'),
      );
    }
  };

  const handleClose = () => {
    setShowShareUrl(isPublic);
    setCopied(false);
    onOpenChange(false);
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={handleClose}>
      <AlertDialogContent>
        {!showShareUrl
          ? (
            // Confirmation step
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('chat.makePublicConfirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('chat.makePublicConfirmDescription')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={updateThreadMutation.isPending}>
                    {t('actions.cancel')}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleMakePublic}
                    disabled={updateThreadMutation.isPending}
                  >
                    {updateThreadMutation.isPending ? t('actions.updating') : t('chat.makePublic')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            )
          : (
            // Share URL step
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('chat.shareThread')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('chat.shareThreadDescription')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="flex items-center gap-2">
                  <Input
                    value={shareUrl}
                    readOnly
                    className="flex-1"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={handleCopy}
                    className="flex-shrink-0"
                  >
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </Button>
                </div>
                <AlertDialogFooter>
                  <AlertDialogAction onClick={handleClose}>
                    {t('actions.done')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
