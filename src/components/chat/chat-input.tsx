'use client';
import type { ChatStatus } from 'ai';
import { ArrowUp, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';
import { useEffect, useRef } from 'react';

import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/ui/cn';

const EMPTY_PARTICIPANTS: ParticipantConfig[] = [];
type ChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  status: ChatStatus;
  onStop?: () => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  toolbar?: React.ReactNode;
  participants?: ParticipantConfig[];
  onRemoveParticipant?: (participantId: string) => void;
  className?: string;
  currentParticipantIndex?: number;
};
export function ChatInput({
  value,
  onChange,
  onSubmit,
  status,
  onStop,
  placeholder,
  disabled = false,
  autoFocus = false,
  toolbar,
  participants = EMPTY_PARTICIPANTS,
  onRemoveParticipant: _onRemoveParticipant,
  className,
  currentParticipantIndex,
}: ChatInputProps) {
  const t = useTranslations();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = status !== 'ready';
  const streamingProgress = isStreaming && currentParticipantIndex !== undefined && participants.length > 1
    ? `${currentParticipantIndex}/${participants.length}`
    : null;
  const isDisabled = disabled || status === 'error';
  const hasValidInput = value.trim().length > 0 && participants.length > 0;

  // AI SDK v5 Pattern: Use requestAnimationFrame for focus after DOM renders
  // This ensures the textarea is visible and properly mounted before focusing
  // More reliable than arbitrary setTimeout delays
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      // Double rAF ensures focus happens after browser completes layout and paint
      const rafId = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          textareaRef.current?.focus();
        });
      });
      return () => cancelAnimationFrame(rafId);
    }
    return undefined;
  }, [autoFocus]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e as unknown as FormEvent);
    }
  };
  return (
    <div className="w-full">
      <div className={cn(
        'relative flex flex-col overflow-hidden',
        'rounded-2xl sm:rounded-xl',
        'border border-white/10',
        'bg-white/5 backdrop-blur-xl',
        'shadow-lg sm:shadow-md',
        className,
      )}
      >
        <form onSubmit={onSubmit} className="flex flex-col">
          <div className="relative flex items-end px-4 sm:px-5 py-3 sm:py-4">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={e => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isDisabled}
              placeholder={placeholder || t('chat.input.placeholder')}
              rows={4}
              className="flex-1 bg-transparent border-0 text-base focus:outline-none focus:ring-0 placeholder:text-muted-foreground/60 disabled:opacity-50 resize-none overflow-y-auto min-h-[80px] max-h-[120px]"
            />
          </div>
          <div className="border-t border-white/5">
            <div className="px-4 sm:px-5 py-2.5 sm:py-3 flex items-center gap-2">
              {toolbar}
              <div className="flex-1" />
              {isStreaming && onStop
                ? (
                    <Button
                      type="button"
                      size="icon"
                      onClick={onStop}
                      variant="outline"
                      className="size-9 sm:size-8 rounded-xl shrink-0 relative touch-manipulation active:scale-95 transition-transform"
                    >
                      <Square className="size-4.5 sm:size-4" />
                      {streamingProgress && (
                        <span className="absolute -top-1 -right-1 text-[10px] font-medium bg-primary text-primary-foreground rounded-full px-1.5 min-w-[22px] text-center">
                          {streamingProgress}
                        </span>
                      )}
                    </Button>
                  )
                : (
                    <Button
                      type="submit"
                      size="icon"
                      disabled={isDisabled || !hasValidInput}
                      variant="outline"
                      className="size-9 sm:size-8 rounded-xl shrink-0 touch-manipulation active:scale-95 transition-transform disabled:active:scale-100"
                    >
                      <ArrowUp className="size-4.5 sm:size-4" />
                    </Button>
                  )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
