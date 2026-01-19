import { memo } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTranslations } from '@/lib/i18n';
import { getRoleBadgeStyle } from '@/lib/utils';

export type ParticipantHeaderProps = {
  avatarSrc: string;
  avatarName: string;
  displayName: string;
  role?: string | null;
  requiredTierName?: string;
  isAccessible?: boolean;
  isStreaming?: boolean;
  hasError?: boolean;
};

export const ParticipantHeader = memo(({
  avatarSrc,
  avatarName,
  displayName,
  role,
  requiredTierName,
  isAccessible = true,
  isStreaming = false,
  hasError = false,
}: ParticipantHeaderProps) => {
  const t = useTranslations();

  return (
    <div className="flex items-center gap-3 mb-6">
      <Avatar className="size-8 drop-shadow-[0_0_12px_hsl(var(--muted-foreground)/0.3)]">
        <AvatarImage src={avatarSrc} alt={avatarName} className="object-contain p-0.5" />
        <AvatarFallback className="text-[8px] bg-muted">
          {avatarName?.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
        <span className="text-xl font-semibold text-muted-foreground">{displayName}</span>
        {role && (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
            style={getRoleBadgeStyle(role)}
          >
            {String(role)}
          </span>
        )}
        {!isAccessible && requiredTierName && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-muted/50 text-muted-foreground border-border/50">
            {t('chat.participant.tierRequired', { tier: requiredTierName })}
          </span>
        )}
        {isStreaming && (
          <span className="ml-1 size-1.5 rounded-full bg-primary/60 animate-pulse flex-shrink-0" />
        )}
        {hasError && (
          <span className="ml-1 size-1.5 rounded-full bg-destructive/80 flex-shrink-0" />
        )}
      </div>
    </div>
  );
});

ParticipantHeader.displayName = 'ParticipantHeader';
