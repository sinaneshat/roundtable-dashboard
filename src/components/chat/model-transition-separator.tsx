'use client';

import { ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getModelById } from '@/lib/ai/models-config';
import { cn } from '@/lib/ui/cn';

// ============================================================================
// Types
// ============================================================================

type ModelTransitionSeparatorProps = {
  fromModelId?: string;
  toModelId: string;
  fromRole?: string | null;
  toRole?: string | null;
  isStreaming?: boolean;
  className?: string;
};

// ============================================================================
// Component
// ============================================================================

/**
 * Model Transition Separator
 *
 * Visual separator showing when one AI model finishes and another begins
 * - Displays both model avatars with an arrow between them
 * - Shows participant roles if available
 * - Animates in when transitioning
 * - Optional streaming indicator for the next model
 */
export function ModelTransitionSeparator({
  fromModelId,
  toModelId,
  fromRole,
  toRole,
  isStreaming = false,
  className,
}: ModelTransitionSeparatorProps) {
  const t = useTranslations();

  const fromModel = fromModelId ? getModelById(fromModelId) : null;
  const toModel = getModelById(toModelId);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={cn(
        'flex items-center justify-center gap-3 py-6 my-2',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {/* From Model (if exists) */}
        {fromModel && (
          <>
            <div className="flex flex-col items-center gap-1.5">
              <Avatar className="size-8 opacity-60 border-2 border-green-500/50">
                {fromModel.metadata?.icon
                  ? (
                      <AvatarImage
                        src={fromModel.metadata.icon}
                        alt={fromModel.name}
                      />
                    )
                  : null}
                <AvatarFallback
                  style={{ backgroundColor: fromModel.metadata?.color || undefined }}
                  className="text-white text-xs"
                >
                  {fromModel.name[0]}
                </AvatarFallback>
              </Avatar>
              <span className="text-[10px] text-muted-foreground">
                {fromRole || fromModel.name}
              </span>
            </div>

            {/* Arrow */}
            <ChevronRight className="size-4 text-muted-foreground" />
          </>
        )}

        {/* To Model */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="relative">
            <Avatar
              className={cn(
                'size-8 border-2 transition-all',
                isStreaming
                  ? 'border-primary ring-2 ring-primary/20'
                  : 'border-border',
              )}
            >
              {toModel?.metadata?.icon
                ? (
                    <AvatarImage
                      src={toModel.metadata.icon}
                      alt={toModel.name}
                    />
                  )
                : null}
              <AvatarFallback
                style={{ backgroundColor: toModel?.metadata?.color || undefined }}
                className="text-white text-xs"
              >
                {toModel?.name?.[0] || 'AI'}
              </AvatarFallback>
            </Avatar>

            {/* Streaming pulse indicator */}
            {isStreaming && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-primary border-2 border-background"
              >
                <div className="size-full rounded-full bg-primary animate-pulse" />
              </motion.div>
            )}
          </div>

          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] font-medium">
              {toRole || toModel?.name || 'AI'}
            </span>
            {isStreaming && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[9px] text-primary"
              >
                {t('chat.streaming.responding')}
              </motion.span>
            )}
          </div>
        </div>
      </div>

      {/* Divider line */}
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent max-w-20" />
    </motion.div>
  );
}
