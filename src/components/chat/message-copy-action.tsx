'use client';

import { useTranslations } from 'next-intl';
import { memo, useCallback, useState } from 'react';

import { Action } from '@/components/ai-elements/actions';
import { Icons } from '@/components/icons';
import { toastManager } from '@/lib/toast';
import { copyToClipboard } from '@/lib/utils';

type MessageCopyActionProps = {
  messageText: string;
  className?: string;
  tooltip?: string;
  label?: string;
};

function arePropsEqual(prevProps: MessageCopyActionProps, nextProps: MessageCopyActionProps): boolean {
  return (
    prevProps.messageText === nextProps.messageText
    && prevProps.className === nextProps.className
    && prevProps.tooltip === nextProps.tooltip
    && prevProps.label === nextProps.label
  );
}

function MessageCopyActionComponent({
  messageText,
  className,
  tooltip,
  label,
}: MessageCopyActionProps) {
  const t = useTranslations('chat.messageActions');
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const success = await copyToClipboard(messageText);

    if (success) {
      setCopied(true);
      toastManager.success(t('copySuccess'), t('copySuccessDescription'));
      setTimeout(() => setCopied(false), 2000);
    } else {
      toastManager.error(t('copyError'), t('copyErrorDescription'));
    }
  }, [messageText, t]);

  return (
    <Action
      tooltip={tooltip ?? t('copy')}
      label={label ?? t('copy')}
      onClick={handleCopy}
      className={className}
    >
      {copied ? <Icons.check className="size-5" /> : <Icons.copy className="size-5" />}
    </Action>
  );
}

export const MessageCopyAction = memo(MessageCopyActionComponent, arePropsEqual);

MessageCopyAction.displayName = 'MessageCopyAction';
