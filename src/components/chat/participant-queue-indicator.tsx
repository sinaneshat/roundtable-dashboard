'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import type { ParticipantConfig } from '@/components/chat/chat-config-sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getModelById } from '@/lib/ai/models-config';
import { cn } from '@/lib/ui/cn';

// ============================================================================
// Types
// ============================================================================

type ParticipantQueueIndicatorProps = {
  participants: ParticipantConfig[];
  currentParticipantIndex?: number;
  isStreaming: boolean;
  className?: string;
};

// ============================================================================
// Component
// ============================================================================

/**
 * Participant Queue Indicator
 *
 * Shows which AI participants are:
 * - Currently streaming (with pulse animation)
 * - Waiting in queue (dimmed)
 * - Already responded (checkmark)
 *
 * This provides clear visual feedback during multi-participant roundtable sessions
 */
export function ParticipantQueueIndicator({
  participants,
  currentParticipantIndex,
  isStreaming,
  className,
}: ParticipantQueueIndicatorProps) {
  const t = useTranslations();

  // Don't show if only one participant
  if (participants.length <= 1) {
    return null;
  }

  // Don't show if not streaming
  if (!isStreaming || currentParticipantIndex === undefined) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={cn('flex items-center justify-center gap-3 py-3', className)}
      >
        <div className="flex items-center gap-2">
          {participants.map((participant, index) => {
            const modelConfig = getModelById(participant.modelId);
            const isCurrent = index === currentParticipantIndex;
            const hasResponded = index < currentParticipantIndex;
            const isWaiting = index > currentParticipantIndex;

            return (
              <motion.div
                key={participant.id || index}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: index * 0.05 }}
                className="relative flex flex-col items-center gap-1.5"
              >
                {/* Avatar with status indicator */}
                <div className="relative">
                  <Avatar
                    className={cn(
                      'size-8 transition-all duration-300 border-2',
                      isCurrent && 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-110',
                      hasResponded && 'opacity-50 border-green-500',
                      isWaiting && 'opacity-30 border-muted',
                      !isCurrent && !hasResponded && !isWaiting && 'border-border',
                    )}
                  >
                    {modelConfig?.metadata?.icon
                      ? (
                          <AvatarImage
                            src={modelConfig.metadata.icon}
                            alt={modelConfig.name}
                          />
                        )
                      : null}
                    <AvatarFallback
                      style={{ backgroundColor: modelConfig?.metadata?.color || undefined }}
                      className="text-white text-xs"
                    >
                      {modelConfig?.name?.[0] || 'AI'}
                    </AvatarFallback>
                  </Avatar>

                  {/* Status badge */}
                  {isCurrent && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-primary border-2 border-background"
                    >
                      <div className="size-full rounded-full bg-primary animate-pulse" />
                    </motion.div>
                  )}

                  {hasResponded && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-green-500 border-2 border-background flex items-center justify-center"
                    >
                      <svg
                        className="size-2 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </motion.div>
                  )}
                </div>

                {/* Label */}
                <div className="flex flex-col items-center gap-0.5">
                  <span
                    className={cn(
                      'text-[10px] font-medium text-center max-w-16 truncate transition-colors',
                      isCurrent && 'text-primary',
                      hasResponded && 'text-muted-foreground',
                      isWaiting && 'text-muted-foreground/50',
                    )}
                  >
                    {participant.role || modelConfig?.name || `Model ${index + 1}`}
                  </span>
                  {isCurrent && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-[9px] text-primary"
                    >
                      {t('chat.streaming.responding')}
                    </motion.span>
                  )}
                  {isWaiting && (
                    <span className="text-[9px] text-muted-foreground/50">
                      {t('chat.streaming.waiting')}
                    </span>
                  )}
                </div>

                {/* Connector line to next participant */}
                {index < participants.length - 1 && (
                  <div
                    className={cn(
                      'absolute top-4 left-full w-3 h-0.5 transition-all duration-300',
                      hasResponded && 'bg-green-500',
                      isCurrent && 'bg-primary',
                      isWaiting && 'bg-muted',
                    )}
                  />
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Progress text */}
        <div className="flex flex-col items-start gap-0.5 ml-2">
          <span className="text-xs font-medium">
            {currentParticipantIndex + 1}
            {' '}
            /
            {participants.length}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {participants.length - currentParticipantIndex - 1}
            {' '}
            {t('chat.streaming.remaining')}
          </span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
