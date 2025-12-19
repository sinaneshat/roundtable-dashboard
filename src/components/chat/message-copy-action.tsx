'use client';

import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo, useCallback, useState } from 'react';

import { MessagePartTypes } from '@/api/core/enums';
import { Action } from '@/components/ai-elements/actions';
import type { MessagePart } from '@/lib/schemas/message-schemas';
import { toastManager } from '@/lib/toast';

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
  const t = useTranslations('chat.actions');
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const text = getTextFromParts(parts);
    if (!text.trim()) {
      return;
    }

    const success = await copyToClipboard(text);

    if (success) {
      setCopied(true);
      toastManager.success(t('copySuccess'), t('copySuccessDescription'));
      setTimeout(() => setCopied(false), 2000);
    } else {
      toastManager.error(t('copyError'), t('copyErrorDescription'));
    }
  }, [parts, t]);

  return (
    <Action
      tooltip={t('copy')}
      label={t('copy')}
      onClick={handleCopy}
      className={className}
    >
      {copied ? <Check className="size-5" /> : <Copy className="size-5" />}
    </Action>
  );
}

export const MessageCopyAction = memo(
  MessageCopyActionComponent,
  (prevProps, nextProps) => {
    return (
      prevProps.parts.length === nextProps.parts.length
      && prevProps.className === nextProps.className
    );
  },
);
