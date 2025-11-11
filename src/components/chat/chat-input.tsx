'use client';
import type { ChatStatus } from 'ai';
import { ArrowUp, Mic, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useRef } from 'react';

import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import { Button } from '@/components/ui/button';
import {
  useAutoResizeTextarea,
  useSpeechRecognition,
} from '@/hooks/utils';
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
  // Speech recognition props
  enableSpeech?: boolean;
  minHeight?: number;
  maxHeight?: number;
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
  // Speech recognition props
  enableSpeech = true,
  minHeight = 80,
  maxHeight = 240,
}: ChatInputProps) {
  const t = useTranslations();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = status !== 'ready';
  const streamingProgress
    = isStreaming && currentParticipantIndex !== undefined && participants.length > 1
      ? `${currentParticipantIndex}/${participants.length}`
      : null;
  const isDisabled = disabled || status === 'error';
  const hasValidInput = value.trim().length > 0 && participants.length > 0;

  // Auto-resizing textarea
  useAutoResizeTextarea(textareaRef, {
    value,
    minHeight,
    maxHeight,
  });

  // Speech recognition
  const handleTranscription = useCallback(
    (transcript: string) => {
      // Insert transcription at cursor position or append
      const textarea = textareaRef.current;
      if (!textarea) {
        onChange(`${value} ${transcript}`);
        return;
      }

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue = `${value.slice(0, start) + transcript} ${value.slice(end)}`;
      onChange(newValue);

      // Set cursor position after inserted text
      setTimeout(() => {
        const newPosition = start + transcript.length + 1;
        textarea.setSelectionRange(newPosition, newPosition);
        textarea.focus();
      }, 0);
    },
    [value, onChange],
  );

  const { isListening, isSupported: isSpeechSupported, toggle: toggleSpeech } = useSpeechRecognition({
    onTranscript: handleTranscription,
  });

  // AI SDK v5 Pattern: Use requestAnimationFrame for focus after DOM renders
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
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
      <div
        className={cn(
          'relative flex flex-col overflow-hidden',
          'rounded-3xl',
          'border border-transparent',
          'bg-gradient-to-r from-white/10 via-white/5 to-white/10 p-px',
          'shadow-lg',
          className,
        )}
      >
        <div className="flex flex-col rounded-2xl bg-white/5 backdrop-blur-xl overflow-hidden h-full">
          <form onSubmit={onSubmit} className="flex flex-col h-full">
            {/* Textarea */}
            <div className="relative flex items-end px-3 py-2">
              <textarea
                ref={textareaRef}
                value={value}
                onChange={e => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isDisabled}
                placeholder={placeholder || t('chat.input.placeholder')}
                className="flex-1 bg-transparent border-0 text-base focus:outline-none focus:ring-0 placeholder:text-muted-foreground/60 disabled:opacity-50 resize-none overflow-y-auto"
                style={{ minHeight: `${minHeight}px` }}
              />
            </div>

            {/* Toolbar and submit */}
            <div>
              <div className="px-3 py-2 flex items-center gap-2">
                {/* Speech recognition button */}
                {enableSpeech && isSpeechSupported && (
                  <Button
                    type="button"
                    size="icon"
                    variant={isListening ? 'default' : 'ghost'}
                    onClick={toggleSpeech}
                    disabled={isDisabled}
                    className={cn(
                      'size-9 shrink-0',
                      isListening && 'animate-pulse',
                    )}
                    title={t('chat.input.voiceInput')}
                  >
                    <Mic className="size-4" />
                  </Button>
                )}

                {/* Existing toolbar */}
                {toolbar}

                <div className="flex-1" />

                {/* Submit/Stop button */}
                {isStreaming && onStop
                  ? (
                      <Button
                        type="button"
                        size="icon"
                        onClick={onStop}
                        className="size-9 rounded-full shrink-0 relative touch-manipulation active:scale-95 transition-transform bg-white text-black hover:bg-white/90"
                      >
                        <Square className="size-4" />
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
                        className="size-9 rounded-full shrink-0 touch-manipulation active:scale-95 transition-transform disabled:active:scale-100 bg-white text-black hover:bg-white/90 disabled:bg-white/20 disabled:text-white/40"
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                    )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
