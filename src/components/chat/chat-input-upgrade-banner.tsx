'use client';

import { useTranslations } from 'next-intl';
import { memo } from 'react';

import { ChatAlertBanner } from '@/components/chat/chat-alert-banner';
import { useFreeTrialState } from '@/hooks/utils';

export const ChatInputUpgradeBanner = memo(() => {
  const t = useTranslations();
  const { isFreeUser, isLoadingStats, hasUsedTrial } = useFreeTrialState();

  if (isLoadingStats || !isFreeUser) {
    return null;
  }

  const message = hasUsedTrial
    ? t('usage.freeTrial.usedDescription')
    : t('usage.freeTrial.availableDescription');

  return (
    <ChatAlertBanner
      message={message}
      variant={hasUsedTrial ? 'warning' : 'success'}
      actionLabel={t('usage.freeTrial.upgradeToPro')}
      actionHref="/chat/pricing"
    />
  );
});

ChatInputUpgradeBanner.displayName = 'ChatInputUpgradeBanner';
