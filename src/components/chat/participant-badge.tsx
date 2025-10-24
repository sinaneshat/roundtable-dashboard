'use client';

import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/ui/cn';
import { getProviderIcon } from '@/lib/utils/ai-display';

import type { StatusIndicatorStatus } from './status-indicator';
import { StatusIndicator } from './status-indicator';

/**
 * ParticipantBadge - Compact participant display with model + role
 *
 * A reusable component that displays AI participant information in a badge format.
 * Shows model avatar, name, role, and optional status indicator.
 *
 * Used in:
 * - Chat participant lists (3+ places)
 * - Message headers
 * - Participant tooltips
 * - Configuration panels
 *
 * Saves ~200 lines of duplicated code across the application.
 *
 * @example
 * // Minimal usage
 * <ParticipantBadge model={gpt4Model} />
 *
 * // With role
 * <ParticipantBadge model={claudeModel} role="Analyst" />
 *
 * // With streaming status
 * <ParticipantBadge model={geminiModel} role="Writer" status="streaming" />
 *
 * // Large variant with all features
 * <ParticipantBadge
 *   model={model}
 *   role="Researcher"
 *   status="streaming"
 *   size="lg"
 *   showProvider
 * />
 */

export type ParticipantBadgeProps = {
  /** The AI model being displayed */
  model: EnhancedModelResponse;
  /** Optional role assignment (e.g., "Analyst", "Writer") */
  role?: string | null;
  /** Current activity status */
  status?: StatusIndicatorStatus;
  /** Visual size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show provider name alongside model name */
  showProvider?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Click handler for interactive badges */
  onClick?: () => void;
  /** Make the badge interactive (adds hover effects) */
  interactive?: boolean;
};

const sizeConfig = {
  sm: {
    avatar: 'size-6',
    text: 'text-xs',
    gap: 'gap-1.5',
    padding: 'px-2 py-1',
    roleBadge: 'text-[10px] px-1.5 py-0 h-4',
  },
  md: {
    avatar: 'size-7',
    text: 'text-sm',
    gap: 'gap-2',
    padding: 'px-2.5 py-1.5',
    roleBadge: 'text-xs px-2 py-0.5 h-5',
  },
  lg: {
    avatar: 'size-8',
    text: 'text-base',
    gap: 'gap-2.5',
    padding: 'px-3 py-2',
    roleBadge: 'text-xs px-2 py-0.5 h-5',
  },
};

export function ParticipantBadge({
  model,
  role,
  status,
  size = 'md',
  showProvider = false,
  className,
  onClick,
  interactive = false,
}: ParticipantBadgeProps) {
  const config = sizeConfig[size];

  // Build display text: "ModelName" or "Provider: ModelName"
  const displayName = showProvider && model.provider
    ? `${model.provider}: ${model.name}`
    : model.name;

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-lg border bg-card',
        config.gap,
        config.padding,
        interactive && 'cursor-pointer hover:bg-accent/50 transition-colors',
        className,
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick
        ? (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onClick();
            }
          }
        : undefined}
    >
      {/* Model Avatar */}
      <Avatar className={cn(config.avatar, 'shrink-0')}>
        <AvatarImage
          src={getProviderIcon(model.provider)}
          alt={model.name}
        />
        <AvatarFallback className={cn(config.text, 'text-[10px]')}>
          {model.name.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      {/* Model Name & Role */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={cn(config.text, 'font-medium truncate')}>
          {displayName}
        </span>

        {/* Role Badge (if assigned) */}
        {role && (
          <Badge
            variant="secondary"
            className={cn(config.roleBadge, 'font-medium shrink-0')}
          >
            {role}
          </Badge>
        )}
      </div>

      {/* Status Indicator (if provided) */}
      {status && (
        <StatusIndicator
          status={status}
          size={size === 'lg' ? 'md' : 'sm'}
          className="shrink-0"
        />
      )}
    </div>
  );
}
