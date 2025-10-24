'use client';

import { AlertCircle, CheckCircle2, Clock, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/ui/cn';

/**
 * MessageStatusBadge - Message metadata display (tokens, timing, errors)
 *
 * A specialized badge component for displaying AI message metadata.
 * Shows token usage, processing time, error states, and other message-level information.
 *
 * Used in:
 * - Message headers
 * - Message footers
 * - Analytics displays
 * - Debug information panels
 *
 * @example
 * // Token usage
 * <MessageStatusBadge
 *   type="tokens"
 *   tokens={{ input: 150, output: 350, total: 500 }}
 * />
 *
 * // Processing time
 * <MessageStatusBadge
 *   type="timing"
 *   duration={2.5}
 * />
 *
 * // Error state
 * <MessageStatusBadge
 *   type="error"
 *   errorMessage="Rate limit exceeded"
 * />
 *
 * // Success state
 * <MessageStatusBadge type="success" />
 */

export type TokenMetadata = {
  input?: number;
  output?: number;
  total?: number;
};

export type MessageStatusType = 'tokens' | 'timing' | 'error' | 'success' | 'processing';

export type MessageStatusBadgeProps = {
  /** Type of status badge to display */
  type: MessageStatusType;
  /** Token usage metadata (required for type="tokens") */
  tokens?: TokenMetadata;
  /** Processing duration in seconds (required for type="timing") */
  duration?: number;
  /** Error message (required for type="error") */
  errorMessage?: string;
  /** Visual size variant */
  size?: 'sm' | 'md';
  /** Additional CSS classes */
  className?: string;
};

const sizeConfig = {
  sm: {
    badge: 'text-[10px] px-1.5 py-0 h-4',
    icon: 'size-2.5',
  },
  md: {
    badge: 'text-xs px-2 py-0.5 h-5',
    icon: 'size-3',
  },
};

export function MessageStatusBadge({
  type,
  tokens,
  duration,
  errorMessage,
  size = 'sm',
  className,
}: MessageStatusBadgeProps) {
  const t = useTranslations('chat.messages');
  const config = sizeConfig[size];

  // Token usage badge
  if (type === 'tokens' && tokens) {
    const displayTokens = tokens.total || (tokens.input || 0) + (tokens.output || 0);

    return (
      <Badge
        variant="secondary"
        className={cn(config.badge, 'font-mono shrink-0', className)}
      >
        <Zap className={cn(config.icon, 'text-chart-2')} />
        <span>
          {displayTokens.toLocaleString()}
          {' '}
          {t('tokens')}
        </span>
      </Badge>
    );
  }

  // Processing time badge
  if (type === 'timing' && duration !== undefined) {
    const formattedDuration = duration < 1
      ? `${Math.round(duration * 1000)}ms`
      : `${duration.toFixed(1)}s`;

    return (
      <Badge
        variant="secondary"
        className={cn(config.badge, 'font-mono shrink-0', className)}
      >
        <Clock className={cn(config.icon, 'text-muted-foreground')} />
        <span>{formattedDuration}</span>
      </Badge>
    );
  }

  // Error state badge
  if (type === 'error') {
    return (
      <Badge
        variant="destructive"
        className={cn(config.badge, 'shrink-0', className)}
      >
        <AlertCircle className={cn(config.icon)} />
        <span>{errorMessage || t('error')}</span>
      </Badge>
    );
  }

  // Success state badge
  if (type === 'success') {
    return (
      <Badge
        variant="success"
        className={cn(config.badge, 'shrink-0', className)}
      >
        <CheckCircle2 className={cn(config.icon)} />
        <span>{t('complete')}</span>
      </Badge>
    );
  }

  // Processing state badge
  if (type === 'processing') {
    return (
      <Badge
        variant="secondary"
        className={cn(config.badge, 'shrink-0', className)}
      >
        <div className={cn(config.icon, 'animate-spin rounded-full border-2 border-primary border-t-transparent')} />
        <span>{t('processing')}</span>
      </Badge>
    );
  }

  return null;
}
