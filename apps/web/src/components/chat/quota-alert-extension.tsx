import { PlanTypes } from '@roundtable/shared';
import { useMemo } from 'react';

import { ChatAlertBanner } from '@/components/chat/chat-alert-banner';
import { useUsageStatsQuery } from '@/hooks/queries';
import { useTranslations } from '@/lib/compat';

type QuotaAlertExtensionProps = {
  /** Minimum credits threshold - show alert when available credits fall below this */
  minCreditsThreshold?: number;
};

/**
 * Quota Alert Extension - Shows for PAID users with insufficient credits.
 *
 * Free users see FreeTrialAlert (amber warning) instead.
 * This component shows a simple message without an upgrade button since
 * paid users cannot purchase the same plan again.
 */
export function QuotaAlertExtension({ minCreditsThreshold = 0 }: QuotaAlertExtensionProps) {
  const t = useTranslations();
  const { data: statsData, isLoading } = useUsageStatsQuery();

  // Only show for PAID users who have insufficient credits
  // Free users see FreeTrialAlert instead
  const shouldShow = useMemo(() => {
    if (!statsData?.success || !statsData.data) {
      return false;
    }
    const { credits, plan } = statsData.data as any;
    // Only show for paid users - free users get FreeTrialAlert
    if (plan?.type !== PlanTypes.PAID) {
      return false;
    }
    // Show when credits fall below the threshold
    return credits.available < minCreditsThreshold || credits.available <= 0;
  }, [statsData, minCreditsThreshold]);

  if (isLoading || !shouldShow) {
    return null;
  }

  return (
    <ChatAlertBanner
      message={t('usage.quotaAlert.paidUserMessage')}
      variant="error"
      showAction={false}
    />
  );
}
