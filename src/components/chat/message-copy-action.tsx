'use client';

import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo, useCallback, useState } from 'react';

import { MessagePartTypes } from '@/api/core/enums';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { MessagePart } from '@/lib/schemas/message-schemas';
import { toastManager } from '@/lib/toast';
import { cn } from '@/lib/ui/cn';

type MessageCopyActionProps = {
  parts: MessagePart[];
  className?: string;
};

/**
 * Extracts text content from message parts
 */
function getTextFromParts(parts: MessagePart[]): string {
  return parts
    .filter(part => part.type === MessagePartTypes.TEXT && 'text' in part)
    .map(part => (part as { type: 'text'; text: string }).text)
    .join('\n\n');
}

/**
 * Copies content to clipboard
 */
async function copyToClipboard(content: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(content);
    return true;
  } catch {
    return false;
  }
}

function MessageCopyActionComponent({
  parts,
  className,
}: MessageCopyActionProps) {
  const t = useTranslations('chat.messageActions');
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const textContent = getTextFromParts(parts);

    if (!textContent.trim()) {
      toastManager.error(t('copyError'), t('noContentToCopy'));
      return;
    }

    const success = await copyToClipboard(textContent);

    if (success) {
      setCopied(true);
      toastManager.success(t('copySuccess'), t('copySuccessDescription'));
      setTimeout(() => setCopied(false), 2000);
    } else {
      toastManager.error(t('copyError'), t('copyErrorDescription'));
    }
  }, [parts, t]);

  // Don't show copy button if no text content
  const hasTextContent = parts.some(
    part => part.type === MessagePartTypes.TEXT && 'text' in part && (part as { text: string }).text?.trim().length > 0,
  );

  if (!hasTextContent) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCopy}
            className={cn(
              'size-10 text-muted-foreground hover:text-foreground transition-colors',
              className,
            )}
            aria-label={t('copyMessage')}
          >
            {copied
              ? <Check className="size-5 text-green-500" />
              : <Copy className="size-5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-sm">{t('copyMessage')}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export const MessageCopyAction = memo(
  MessageCopyActionComponent,
  (prevProps, nextProps) => {
    return (
      prevProps.parts === nextProps.parts
      && prevProps.className === nextProps.className
    );
  },
);
