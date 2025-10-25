'use client';
import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/ui/cn';
import { getProviderIcon } from '@/lib/utils/ai-display';

import type { StatusIndicatorStatus } from './status-indicator';
import { StatusIndicator } from './status-indicator';

export type ParticipantBadgeProps = {
  model: EnhancedModelResponse;
  role?: string | null;
  status?: StatusIndicatorStatus;
  size?: 'sm' | 'md' | 'lg';
  showProvider?: boolean;
  className?: string;
  onClick?: () => void;
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
      <Avatar className={cn(config.avatar, 'shrink-0')}>
        <AvatarImage
          src={getProviderIcon(model.provider)}
          alt={model.name}
        />
        <AvatarFallback className={cn(config.text, 'text-[10px]')}>
          {model.name.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={cn(config.text, 'font-medium truncate')}>
          {displayName}
        </span>
        {role && (
          <Badge
            variant="secondary"
            className={cn(config.roleBadge, 'font-medium shrink-0')}
          >
            {role}
          </Badge>
        )}
      </div>
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
