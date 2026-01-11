'use client';

import type { UIMessage } from 'ai';
import { useTranslations } from 'next-intl';
import { memo, useCallback, useMemo } from 'react';

import { CopyIconVariants } from '@/api/core/enums';
import type { ChatParticipant } from '@/api/routes/chat/schema';
import { CopyActionButton } from '@/components/chat/copy-actions/copy-action-button';
import { useCopyToClipboard } from '@/hooks/utils';
import { formatRoundAsMarkdown } from '@/lib/utils';

type RoundCopyActionProps = {
  messages: UIMessage[];
  participants: ChatParticipant[];
  roundNumber: number;
  threadTitle?: string;
  moderatorText?: string;
  className?: string;
};

function RoundCopyActionComponent({
  messages,
  participants,
  roundNumber,
  threadTitle,
  moderatorText,
  className,
}: RoundCopyActionProps) {
  const t = useTranslations('chat.roundActions');

  const toastMessages = useMemo(() => ({
    successTitle: t('copySuccess'),
    successDescription: t('copySuccessDescription'),
    errorTitle: t('copyError'),
    errorDescription: t('copyErrorDescription'),
  }), [t]);

  const { copied, copy } = useCopyToClipboard({ messages: toastMessages });

  const handleCopy = useCallback(() => {
    const markdown = formatRoundAsMarkdown(messages, participants, roundNumber, {
      threadTitle,
      moderatorText,
    });
    copy(markdown);
  }, [copy, messages, participants, roundNumber, threadTitle, moderatorText]);

  return (
    <CopyActionButton
      copied={copied}
      onClick={handleCopy}
      tooltip={t('copyRound')}
      label={t('copyRound')}
      className={className}
      variant={CopyIconVariants.STACK}
    />
  );
}

export const RoundCopyAction = memo(
  RoundCopyActionComponent,
  (prevProps, nextProps) => (
    prevProps.roundNumber === nextProps.roundNumber
    && prevProps.messages.length === nextProps.messages.length
    && prevProps.threadTitle === nextProps.threadTitle
    && prevProps.moderatorText === nextProps.moderatorText
    && prevProps.className === nextProps.className
  ),
);

RoundCopyAction.displayName = 'RoundCopyAction';
