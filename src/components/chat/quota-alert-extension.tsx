/**
 * Quota Alert Extension - Compact alert for quota limits
 *
 * Displays when quota limits are reached with:
 * - Clear, concise messaging about the limit
 * - Compact design that blends with input
 * - Inline upgrade action
 */
'use client';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { useUsageStatsQuery } from '@/hooks/queries';
import { cn } from '@/lib/ui/cn';

type QuotaAlertExtensionProps = {
  /**
   * Which quota type matters for this screen:
   * - 'threads': Overview screen (creating new threads)
   * - 'messages': Thread screen (sending messages)
   */
  checkType: 'threads' | 'messages';
};

export function QuotaAlertExtension({ checkType }: QuotaAlertExtensionProps) {
  const router = useRouter();
  const { data: statsData, isLoading } = useUsageStatsQuery();

  // Determine if the relevant quota is exceeded and what's blocking
  const { isBlocked, blockerType, limit } = useMemo(() => {
    // Type guard: ensure statsData has the expected shape
    if (
      !statsData
      || typeof statsData !== 'object'
      || !('success' in statsData)
      || !statsData.success
      || !('data' in statsData)
      || !statsData.data
    ) {
      return { isBlocked: false, blockerType: null, limit: 0 };
    }

    const data = statsData.data as {
      threads: { remaining: number; limit: number };
      messages: { remaining: number; limit: number };
      analysis?: { remaining: number; limit: number };
    };

    // Check if the primary quota type is exceeded
    if (checkType === 'threads' && data.threads.remaining === 0) {
      return {
        isBlocked: true,
        blockerType: 'threads' as const,
        limit: data.threads.limit,
      };
    }

    if (checkType === 'messages' && data.messages.remaining === 0) {
      return {
        isBlocked: true,
        blockerType: 'messages' as const,
        limit: data.messages.limit,
      };
    }

    // Also check if analysis quota is exceeded (blocks multi-participant chats)
    if (data.analysis && data.analysis.remaining === 0) {
      return {
        isBlocked: true,
        blockerType: 'analysis' as const,
        limit: data.analysis.limit,
      };
    }

    return { isBlocked: false, blockerType: null, limit: 0 };
  }, [statsData, checkType]);

  // Get description message
  const getDescription = () => {
    switch (blockerType) {
      case 'threads':
        return `You've reached your ${limit} thread limit for this month. Upgrade to create more threads.`;
      case 'messages':
        return `You've reached your ${limit} message limit for this month. Upgrade to continue chatting.`;
      case 'analysis':
        return `You've reached your ${limit} analysis limit for this month. Upgrade for multi-participant conversations.`;
      default:
        return 'Upgrade your plan to continue.';
    }
  };

  if (isLoading || !isBlocked || !blockerType) {
    return null;
  }

  const description = getDescription();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        className="overflow-hidden"
      >
        <div
          className={cn(
            'flex items-center justify-between gap-3 px-3 py-2',
            'border-0 border-b border-destructive/20 rounded-none rounded-t-2xl',
            'bg-destructive/10 backdrop-blur-xl',
          )}
        >
          <p className="text-[10px] leading-tight text-destructive font-medium text-left flex-1 min-w-0">
            {description}
          </p>
          <Button
            variant="destructive"
            size="sm"
            className="h-6 px-3 text-[10px] font-semibold shrink-0 rounded-full"
            onClick={() => router.push('/chat/pricing')}
          >
            Upgrade
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
