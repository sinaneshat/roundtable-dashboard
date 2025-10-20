'use client';

import type { ChatStatus } from 'ai';
import { ArrowUp, Square, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { GlowingEffect } from '@/components/ui/glowing-effect';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useModelsQuery } from '@/hooks/queries/models';
import type { ParticipantConfig } from '@/lib/types/participant-config';
import { cn } from '@/lib/ui/cn';

// ============================================================================
// OFFICIAL AI SDK PATTERN: Chat Input Component
// Following official documentation - no custom types or logic
// ============================================================================

// Stable default values to prevent re-renders
const EMPTY_PARTICIPANTS: ParticipantConfig[] = [];

type ChatInputProps = {
  /** Current input value */
  value: string;
  /** Input change handler */
  onChange: (value: string) => void;
  /** Form submit handler */
  onSubmit: (e: FormEvent) => void;
  /** Chat status from official AI SDK */
  status: ChatStatus;
  /** Stop handler for interrupting streaming */
  onStop?: () => void;
  /** Placeholder text */
  placeholder?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Auto focus */
  autoFocus?: boolean;
  /** Toolbar content (participants, mode selectors) */
  toolbar?: React.ReactNode;
  /** Selected participants to display as chips */
  participants?: ParticipantConfig[];
  /** Callback to remove a participant */
  onRemoveParticipant?: (participantId: string) => void;
  /** Additional className */
  className?: string;
};

/**
 * Shared Chat Input Component
 *
 * OFFICIAL AI SDK PATTERN + ENHANCED UX:
 * - Uses ChatStatus from 'ai' package (no custom types)
 * - Simple form submission with useState + onChange
 * - Double-layer glassmorphic border design
 * - Selected models displayed as chips at bottom
 * - Model icons and roles shown in chips
 * - Quick remove functionality with X button
 *
 * Design Inspiration:
 * - Double-border glass effect with different opacities
 * - Clean chip display for selected models
 * - Prominent submit button
 * - Responsive and mobile-friendly
 */
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
  onRemoveParticipant,
  className,
}: ChatInputProps) {
  const t = useTranslations();
  const { data: modelsData } = useModelsQuery();
  const allModels = modelsData?.data?.items || [];

  // OFFICIAL PATTERN: Simple keyboard handler
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e as unknown as FormEvent);
    }
  };

  // ✅ FIX: AI SDK v5 uses 'in_progress' for streaming, not 'submitted' or 'streaming'
  const isStreaming = status !== 'ready';
  // Submit button should be disabled when explicitly disabled or when not ready AND not streaming (error state)
  const isDisabled = disabled || status === 'error';
  // ✅ VALIDATION: Submit should be disabled if no participants are selected or input is empty
  const hasValidInput = value.trim().length > 0 && participants.length > 0;

  return (
    <div className="w-full">
      {/* ✅ DOUBLE-LAYER GLASS BORDER: Outer container with subtle border */}
      <div className={cn(
        'relative h-full',
        'rounded-2xl md:rounded-3xl',
        'border border-white/10 dark:border-white/5',
        'p-2 md:p-3',
        'shadow-lg',
        className,
      )}
      >
        {/* ✅ GLOWING EFFECT: Interactive gradient border animation */}
        <GlowingEffect
          blur={0}
          borderWidth={2}
          spread={80}
          glow={false}
          disabled={false}
          proximity={64}
          inactiveZone={0.01}
        />

        {/* ✅ INNER GLASS LAYER: Glass see-through design with strong blur */}
        <div className={cn(
          'relative flex flex-col overflow-hidden',
          'rounded-xl',
          'bg-white/5 dark:bg-white/5 backdrop-blur-xl',
          'dark:shadow-[0px_0px_27px_0px_#2D2D2D]',
        )}
        >
          {/* OFFICIAL PATTERN: Simple HTML form */}
          <form onSubmit={onSubmit} className="flex flex-col">
            {/* Main Input Area - NO submit button here */}
            <div className="relative flex items-end px-5 py-4">
              {/* Textarea Input */}
              <textarea
                value={value}
                onChange={e => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isDisabled}
                placeholder={placeholder || t('chat.input.placeholder')}
                rows={1}
                className="flex-1 bg-transparent border-0 text-base focus:outline-none focus:ring-0 placeholder:text-muted-foreground/60 disabled:opacity-50 resize-none min-h-[44px] max-h-[200px]"
                style={{ fieldSizing: 'content' } as React.CSSProperties}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- Intentional UX for chat input
                autoFocus={autoFocus}
              />
            </div>

            {/* Footer Section: Two rows - toolbar first, then chips */}
            <div className="border-t border-white/5">
              {/* Row 1: Toolbar buttons and submit button */}
              <div className="px-5 py-3 flex items-center gap-2">
                {/* Toolbar buttons on the left */}
                {toolbar}

                {/* Spacer to push submit button to the right */}
                <div className="flex-1" />

                {/* Submit/Stop Button on the far right - square icon button */}
                {isStreaming && onStop
                  ? (
                      <Button
                        type="button"
                        size="icon"
                        onClick={onStop}
                        variant="outline"
                        className="size-8 rounded-lg shrink-0"
                      >
                        <Square className="size-4" />
                      </Button>
                    )
                  : (
                      <Button
                        type="submit"
                        size="icon"
                        disabled={isDisabled || !hasValidInput}
                        variant="outline"
                        className="size-8 rounded-lg shrink-0"
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                    )}
              </div>

              {/* Row 2: Selected model chips (separate row below toolbar) */}
              {participants.length > 0 && (
                <div className="px-5 pb-3 pt-2">
                  <ScrollArea className="w-full">
                    <div className="flex items-center gap-2 pb-2">
                      {participants
                        .sort((a, b) => a.order - b.order)
                        .map((participant) => {
                          const model = allModels.find(m => m.id === participant.modelId);
                          if (!model)
                            return null;

                          return (
                            <div
                              key={participant.id}
                              className={cn(
                                'inline-flex items-center gap-1.5',
                                'h-7 px-2.5 py-1',
                                'rounded-md',
                                'bg-white/5 backdrop-blur-sm',
                                'text-sm font-normal text-white/70',
                                'transition-all duration-200',
                                'hover:bg-white/10',
                                'whitespace-nowrap',
                                'flex-shrink-0',
                              )}
                            >
                              {/* Model Name */}
                              <span className="text-xs leading-none">
                                {model.name}
                              </span>

                              {/* Remove Button */}
                              {onRemoveParticipant && (
                                <button
                                  type="button"
                                  onClick={() => onRemoveParticipant(participant.id)}
                                  className={cn(
                                    'shrink-0',
                                    'rounded-sm',
                                    'p-0.5',
                                    'hover:bg-white/20',
                                    'transition-colors',
                                  )}
                                  aria-label={`Remove ${model.name}`}
                                >
                                  <X className="size-2.5 text-white/60 hover:text-white/90" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                    </div>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                </div>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
