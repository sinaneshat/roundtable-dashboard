/**
 * ✅ QUOTA WARNING - Single source of truth for quota limit UI
 *
 * Uses stats API to check ALL quotas (threads, messages, analysis) and displays
 * an inline warning when any limit is reached.
 *
 * Features:
 * - Clean inline design (one line + inline upgrade button)
 * - Context-aware (shows relevant quota based on checkType prop)
 * - Checks all quotas automatically (not just the primary one)
 * - Auto-refreshes every 30 seconds via useUsageStatsQuery
 * - Shows which specific quota(s) are exceeded
 *
 * Usage:
 * - Overview screen: <UnifiedQuotaWarning checkType="threads" />
 * - Thread screen: <UnifiedQuotaWarning checkType="messages" />
 */
'use client';
import { AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { useUsageStatsQuery } from '@/hooks/queries';
import { cn } from '@/lib/ui/cn';

type UnifiedQuotaWarningProps = {
  /**
   * Which quota type matters for this screen:
   * - 'threads': Overview screen (creating new threads)
   * - 'messages': Thread screen (sending messages)
   */
  checkType: 'threads' | 'messages';
  className?: string;
};

export function UnifiedQuotaWarning({ checkType, className }: UnifiedQuotaWarningProps) {
  const t = useTranslations();
  const router = useRouter();
  const { data: statsData, isLoading } = useUsageStatsQuery();

  // Determine if the relevant quota is exceeded and what's blocking
  const { isBlocked, blockerType, current, limit } = useMemo(() => {
    if (!statsData?.success)
      return { isBlocked: false, blockerType: null, current: 0, limit: 0 };

    const { data } = statsData;

    // Check if the primary quota type is exceeded
    if (checkType === 'threads' && data.threads.remaining === 0) {
      return {
        isBlocked: true,
        blockerType: 'threads' as const,
        current: data.threads.used,
        limit: data.threads.limit,
      };
    }

    if (checkType === 'messages' && data.messages.remaining === 0) {
      return {
        isBlocked: true,
        blockerType: 'messages' as const,
        current: data.messages.used,
        limit: data.messages.limit,
      };
    }

    // Also check if analysis quota is exceeded (blocks multi-participant chats)
    if (data.analysis && data.analysis.remaining === 0) {
      return {
        isBlocked: true,
        blockerType: 'analysis' as const,
        current: data.analysis.used,
        limit: data.analysis.limit,
      };
    }

    return { isBlocked: false, blockerType: null, current: 0, limit: 0 };
  }, [statsData, checkType]);

  if (isLoading || !isBlocked || !blockerType) {
    return null;
  }

  // Get appropriate message based on blocker type
  const getMessage = () => {
    switch (blockerType) {
      case 'threads':
        return t('chat.quota.threadLimitReached', { current, limit });
      case 'messages':
        return t('chat.quota.messageLimitReached', { current, limit });
      case 'analysis':
        return t('chat.quota.analysisLimitReached', { current, limit });
      default:
        return t('chat.quota.limitReached');
    }
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-4 py-2.5 mb-3 rounded-xl',
        'bg-destructive/10 border border-destructive/20',
        'text-sm text-destructive',
        className,
      )}
    >
      <AlertCircle className="size-4 shrink-0" />
      <span className="flex-1">{getMessage()}</span>
      <Button
        variant="default"
        size="sm"
        className="h-7 rounded-full text-xs font-medium shrink-0"
        onClick={() => router.push('/chat/pricing')}
      >
        {t('usage.upgrade')}
      </Button>
    </div>
  );
}
