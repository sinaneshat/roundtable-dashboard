'use client';

import { useTranslations } from 'next-intl';
import { memo, useCallback, useMemo } from 'react';

import { CopyActionButton } from '@/components/chat/copy-actions/copy-action-button';
import { useCopyToClipboard } from '@/hooks/utils';

type ModeratorCopyActionProps = {
  moderatorText: string;
  className?: string;
};

function ModeratorCopyActionComponent({
  moderatorText,
  className,
}: ModeratorCopyActionProps) {
  const t = useTranslations('chat.roundActions');

  const messages = useMemo(() => ({
    successTitle: t('copySuccess'),
    successDescription: t('copySuccessDescription'),
    errorTitle: t('copyError'),
    errorDescription: t('copyErrorDescription'),
  }), [t]);

  const { copied, copy } = useCopyToClipboard({ messages });

  const handleCopy = useCallback(() => {
    copy(moderatorText);
  }, [copy, moderatorText]);

  return (
    <CopyActionButton
      copied={copied}
      onClick={handleCopy}
      tooltip={t('copySummary')}
      label={t('copySummary')}
      className={className}
      variant="copy"
    />
  );
}

export const ModeratorCopyAction = memo(
  ModeratorCopyActionComponent,
  (prevProps, nextProps) => (
    prevProps.moderatorText === nextProps.moderatorText
    && prevProps.className === nextProps.className
  ),
);

ModeratorCopyAction.displayName = 'ModeratorCopyAction';
