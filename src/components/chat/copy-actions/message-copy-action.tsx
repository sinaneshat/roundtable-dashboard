'use client';

import { useTranslations } from 'next-intl';
import { memo, useCallback, useMemo } from 'react';

import { CopyActionButton } from '@/components/chat/copy-actions/copy-action-button';
import { useCopyToClipboard } from '@/hooks/utils';

type MessageCopyActionProps = {
  messageText: string;
  className?: string;
  tooltip?: string;
  label?: string;
};

function MessageCopyActionComponent({
  messageText,
  className,
  tooltip,
  label,
}: MessageCopyActionProps) {
  const t = useTranslations('chat.messageActions');

  const messages = useMemo(() => ({
    successTitle: t('copySuccess'),
    successDescription: t('copySuccessDescription'),
    errorTitle: t('copyError'),
    errorDescription: t('copyErrorDescription'),
  }), [t]);

  const { copied, copy } = useCopyToClipboard({ messages });

  const handleCopy = useCallback(() => {
    copy(messageText);
  }, [copy, messageText]);

  return (
    <CopyActionButton
      copied={copied}
      onClick={handleCopy}
      tooltip={tooltip ?? t('copy')}
      label={label ?? t('copy')}
      className={className}
      variant="copy"
    />
  );
}

export const MessageCopyAction = memo(
  MessageCopyActionComponent,
  (prevProps, nextProps) => (
    prevProps.messageText === nextProps.messageText
    && prevProps.className === nextProps.className
    && prevProps.tooltip === nextProps.tooltip
    && prevProps.label === nextProps.label
  ),
);

MessageCopyAction.displayName = 'MessageCopyAction';
