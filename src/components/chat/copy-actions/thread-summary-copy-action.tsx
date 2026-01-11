'use client';

import type { UIMessage } from 'ai';
import { useTranslations } from 'next-intl';
import { memo, useCallback, useMemo } from 'react';

import { CopyIconVariants } from '@/api/core/enums';
import type { ChatParticipant } from '@/api/routes/chat/schema';
import { CopyActionButton } from '@/components/chat/copy-actions/copy-action-button';
import { useCopyToClipboard } from '@/hooks/utils';
import { formatThreadAsMarkdown } from '@/lib/utils';

type ThreadSummaryCopyActionProps = {
  messages: UIMessage[];
  participants: ChatParticipant[];
  threadTitle?: string;
  className?: string;
};

function ThreadSummaryCopyActionComponent({
  messages,
  participants,
  threadTitle,
  className,
}: ThreadSummaryCopyActionProps) {
  const t = useTranslations('chat.roundActions');

  const toastMessages = useMemo(() => ({
    successTitle: t('copyThreadSuccess'),
    successDescription: t('copyThreadSuccessDescription'),
    errorTitle: t('copyError'),
    errorDescription: t('copyErrorDescription'),
  }), [t]);

  const { copied, copy } = useCopyToClipboard({ messages: toastMessages });

  const handleCopy = useCallback(() => {
    const markdown = formatThreadAsMarkdown(messages, participants, threadTitle);
    copy(markdown);
  }, [copy, messages, participants, threadTitle]);

  return (
    <CopyActionButton
      copied={copied}
      onClick={handleCopy}
      tooltip={t('copyThread')}
      label={t('copyThread')}
      className={className}
      variant={CopyIconVariants.STACK}
    />
  );
}

export const ThreadSummaryCopyAction = memo(
  ThreadSummaryCopyActionComponent,
  (prevProps, nextProps) => (
    prevProps.messages.length === nextProps.messages.length
    && prevProps.participants === nextProps.participants
    && prevProps.threadTitle === nextProps.threadTitle
    && prevProps.className === nextProps.className
  ),
);

ThreadSummaryCopyAction.displayName = 'ThreadSummaryCopyAction';
