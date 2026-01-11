'use client';

import { memo } from 'react';

import type { BorderVariant } from '@/api/core/enums';
import { BorderVariants } from '@/api/core/enums';
import { ChatAutoModeToggle } from '@/components/chat/chat-auto-mode-toggle';
import { useFreeTrialState } from '@/hooks/utils';
import { cn } from '@/lib/ui/cn';

type ChatInputHeaderProps = {
  autoMode: boolean;
  onAutoModeChange: (value: boolean) => void;
  isAnalyzing?: boolean;
  disabled?: boolean;
  borderVariant?: BorderVariant;
};

export const ChatInputHeader = memo(({
  autoMode,
  onAutoModeChange,
  isAnalyzing = false,
  disabled = false,
  borderVariant = BorderVariants.DEFAULT,
}: ChatInputHeaderProps) => {
  const { isFreeUser } = useFreeTrialState();

  const hasUpgradeBanner = isFreeUser;

  return (
    <div
      className={cn(
        'flex items-center',
        hasUpgradeBanner ? 'rounded-none' : 'rounded-t-2xl',
        'border border-b-0',
        'bg-card',
        'overflow-hidden',
        'px-2 sm:px-3 py-1.5 sm:py-2',
        borderVariant === BorderVariants.SUCCESS && 'border-green-500/30',
        borderVariant === BorderVariants.WARNING && 'border-amber-500/30',
        borderVariant === BorderVariants.ERROR && 'border-destructive',
      )}
    >
      <ChatAutoModeToggle
        autoMode={autoMode}
        onAutoModeChange={onAutoModeChange}
        isAnalyzing={isAnalyzing}
        disabled={disabled}
      />
    </div>
  );
});

ChatInputHeader.displayName = 'ChatInputHeader';
