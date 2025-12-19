'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BRAND } from '@/constants/brand';

import { MODERATOR_NAME } from './moderator-constants';

type ModeratorHeaderProps = {
  isStreaming?: boolean;
  hasError?: boolean;
};

/**
 * ModeratorHeader - Header component matching ParticipantHeader style
 */
export function ModeratorHeader({
  isStreaming = false,
  hasError = false,
}: ModeratorHeaderProps) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <Avatar className="size-8 drop-shadow-[0_0_12px_hsl(var(--primary)/0.3)]">
        <AvatarImage src={BRAND.logos.main} alt={MODERATOR_NAME} className="object-contain p-0.5" />
        <AvatarFallback className="text-[8px] bg-muted">
          {MODERATOR_NAME.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
        <span className="text-xl font-semibold text-muted-foreground">{MODERATOR_NAME}</span>
        {isStreaming && (
          <span className="ml-1 size-1.5 rounded-full bg-primary/60 animate-pulse" />
        )}
        {hasError && (
          <span className="ml-1 size-1.5 rounded-full bg-destructive/80" />
        )}
      </div>
    </div>
  );
}
