import { memo, useCallback, useMemo } from 'react';

import { CopyActionButton } from '@/components/chat/copy-actions/copy-action-button';
import { useCopyToClipboard } from '@/hooks/utils';
import { useTranslations } from '@/lib/i18n';

type ModeratorCopyActionProps = {
  moderatorText: string;
  className?: string;
};

function ModeratorCopyActionComponent({
  moderatorText,
  className,
}: ModeratorCopyActionProps) {
  const t = useTranslations();

  const messages = useMemo(() => ({
    successTitle: t('chat.roundActions.copySuccess'),
    successDescription: t('chat.roundActions.copySuccessDescription'),
    errorTitle: t('chat.roundActions.copyError'),
    errorDescription: t('chat.roundActions.copyErrorDescription'),
  }), [t]);

  const { copied, copy } = useCopyToClipboard({ messages });

  const handleCopy = useCallback(() => {
    copy(moderatorText);
  }, [copy, moderatorText]);

  return (
    <CopyActionButton
      copied={copied}
      onClick={handleCopy}
      tooltip={t('chat.roundActions.copySummary')}
      label={t('chat.roundActions.copySummary')}
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
