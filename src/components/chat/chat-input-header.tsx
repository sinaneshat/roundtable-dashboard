'use client';

import { memo } from 'react';

import { ChatAutoModeToggle } from '@/components/chat/chat-auto-mode-toggle';
import { useFreeTrialState } from '@/hooks/utils';
import { cn } from '@/lib/ui/cn';

type ChatInputHeaderProps = {
  autoMode: boolean;
  onAutoModeChange: (value: boolean) => void;
  isAnalyzing?: boolean;
  disabled?: boolean;
};

export const ChatInputHeader = memo(({
  autoMode,
  onAutoModeChange,
  isAnalyzing = false,
  disabled = false,
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
