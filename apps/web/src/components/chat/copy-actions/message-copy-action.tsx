import { memo, useCallback, useMemo } from 'react';

import { CopyActionButton } from '@/components/chat/copy-actions/copy-action-button';
import { useCopyToClipboard } from '@/hooks/utils';
import { useTranslations } from '@/lib/i18n';

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
  const t = useTranslations();

  const messages = useMemo(() => ({
    successTitle: t('chat.messageActions.copySuccess'),
    successDescription: t('chat.messageActions.copySuccessDescription'),
    errorTitle: t('chat.messageActions.copyError'),
    errorDescription: t('chat.messageActions.copyErrorDescription'),
  }), [t]);

  const { copied, copy } = useCopyToClipboard({ messages });

  const handleCopy = useCallback(() => {
    copy(messageText);
  }, [copy, messageText]);

  return (
    <CopyActionButton
      copied={copied}
      onClick={handleCopy}
      tooltip={tooltip ?? t('chat.messageActions.copy')}
      label={label ?? t('chat.messageActions.copy')}
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
