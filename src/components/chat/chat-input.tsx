'use client';

import type { ChatStatus } from 'ai';
import { ArrowUp, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/ui/cn';

// ============================================================================
// OFFICIAL AI SDK PATTERN: Chat Input Component
// Following official documentation - no custom types or logic
// ============================================================================

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
  /** Additional className */
  className?: string;
};

/**
 * Shared Chat Input Component
 *
 * OFFICIAL AI SDK PATTERN:
 * - Uses ChatStatus from 'ai' package (no custom types)
 * - Simple form submission with useState + onChange
 * - No custom logic - exactly as AI SDK docs suggest
 *
 * Design:
 * - Glass design using chatGlass.inputBox from glassmorphism library
 * - Prominent backdrop blur and shadow for visibility
 * - Focus states with ring and border highlighting
 * - Consistent border radius (rounded-lg)
 * - ArrowUp icon button instead of text
 * - Reusable between all chat screens
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
  className,
}: ChatInputProps) {
  const t = useTranslations();

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

  return (
    <div className="w-full">
      {/* OFFICIAL PATTERN: Simple HTML form - Styling applied via className prop */}
      <form
        onSubmit={onSubmit}
        className={cn('rounded-lg p-1', className)}
      >
        <div className="flex flex-col gap-1">
          {/* Textarea Input */}
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isDisabled}
            placeholder={placeholder || t('chat.input.placeholder')}
            rows={3}
            className="flex-1 px-3 py-2 bg-transparent border-0 text-sm focus:outline-none focus:ring-0 placeholder:text-muted-foreground disabled:opacity-50 resize-none min-h-[80px] max-h-[200px]"
            style={{ fieldSizing: 'content' } as React.CSSProperties}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- Intentional UX for chat input
            autoFocus={autoFocus}
          />

          {/* Toolbar */}
          <div className="flex items-center justify-between px-2 pb-1">
            {/* Left: Toolbar content (participants, mode) */}
            {toolbar && (
              <div className="flex items-center gap-1.5">
                {toolbar}
              </div>
            )}
            {!toolbar && <div />}

            {/* Right: Submit/Stop Button */}
            <div className="flex items-center gap-2">
              {isStreaming && onStop
                ? (
                    <Button
                      type="button"
                      size="icon"
                      onClick={onStop}
                      variant="ghost"
                      className="rounded-lg size-9"
                    >
                      <Square className="size-4" />
                    </Button>
                  )
                : (
                    <Button
                      type="submit"
                      size="icon"
                      disabled={isDisabled || !value.trim()}
                      className="rounded-lg size-9"
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                  )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
