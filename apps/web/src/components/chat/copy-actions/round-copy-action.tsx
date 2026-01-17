import { CopyIconVariants } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { memo, useCallback, useMemo } from 'react';

import { CopyActionButton } from '@/components/chat/copy-actions/copy-action-button';
import { useCopyToClipboard } from '@/hooks/utils';
import { useTranslations } from '@/lib/compat';
import { formatRoundAsMarkdown } from '@/lib/utils';
import type { ChatParticipant } from '@/types/api';

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
  const t = useTranslations();

  const toastMessages = useMemo(() => ({
    successTitle: t('chat.roundActions.copySuccess'),
    successDescription: t('chat.roundActions.copySuccessDescription'),
    errorTitle: t('chat.roundActions.copyError'),
    errorDescription: t('chat.roundActions.copyErrorDescription'),
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
      tooltip={t('chat.roundActions.copyRound')}
      label={t('chat.roundActions.copyRound')}
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
