'use client';

import { useTranslations } from 'next-intl';

import { ChatAlertBanner } from '@/components/chat/chat-alert-banner';
import { useFreeTrialState } from '@/hooks/utils';

/**
 * Free Trial Alert - Shows upgrade prompt for free users
 *
 * Free users get ONE thread + ONE round upon signup.
 * Once they create a thread, they've used their quota and can only:
 * - Resume that thread (stream resumption works)
 * - Upgrade to Pro for unlimited access
 *
 * States:
 * - 'available': Fresh user, no thread created yet (green)
 * - 'used': User has created a thread (amber warning)
 */
export function FreeTrialAlert() {
  const t = useTranslations();
  const { isFreeUser, hasUsedTrial, isWarningState, isLoadingStats } = useFreeTrialState();

  if (isLoadingStats || !isFreeUser) {
    return null;
  }

  const message = hasUsedTrial
    ? t('usage.freeTrial.usedDescription')
    : t('usage.freeTrial.availableDescription');

  return (
    <ChatAlertBanner
      message={message}
      variant={isWarningState ? 'warning' : 'success'}
      actionLabel={t('usage.freeTrial.upgradeToPro')}
      actionHref="/chat/pricing"
    />
  );
}
