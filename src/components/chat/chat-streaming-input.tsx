'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowUp, Square, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { KeyboardEventHandler, MutableRefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { MessageContentSchema } from '@/api/routes/chat/schema';
import { ParticipantsPreview } from '@/components/chat/chat-participants-list';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/ui/cn';
import type { ThreadMode } from '@/services/api';

// Local type for participant data in the streaming input
type ThreadParticipant = {
  id: string;
  modelId: string;
  name?: string;
  role?: string | null;
  customRoleId?: string | null;
  priority: number;
};

// ============================================================================
// Constants
// ============================================================================

const CHAT_MODES = [
  { value: 'brainstorming', label: 'Brainstorming', icon: '💡' },
  { value: 'analyzing', label: 'Analyzing', icon: '🔍' },
  { value: 'debating', label: 'Debating', icon: '⚖️' },
  { value: 'solving', label: 'Problem Solving', icon: '🎯' },
] as const;

// ============================================================================
// Form Schema - Reusing Backend Validation
// ============================================================================

/**
 * Streaming input form validation schema
 * Reuses backend MessageContentSchema to ensure consistency
 */
const streamingInputSchema = z.object({
  message: MessageContentSchema,
});

type StreamingInputFormData = z.infer<typeof streamingInputSchema>;

// ============================================================================
// Component Props
// ============================================================================

type ChatStreamingInputProps = {
  threadMode: ThreadMode;
  participants: ThreadParticipant[];
  className?: string;
  autoFocus?: boolean;
  isStreaming?: boolean;
  onSubmit: (message: string) => void;
  onStop?: () => void;
};

// ============================================================================
// Component
// ============================================================================

/**
 * Chat Streaming Input Component
 *
 * Input component for real-time streaming chat with AI SDK:
 * - Integrates with useChat hook from @ai-sdk/react
 * - Shows streaming state with stop button
 * - Disabled during AI response
 * - Auto-scrolling support
 * - ChatGPT-style interface
 *
 * Following patterns from /docs/frontend-patterns.md
 */
export function ChatStreamingInput({
  threadMode,
  participants,
  className,
  autoFocus = false,
  isStreaming = false,
  onSubmit,
  onStop,
}: ChatStreamingInputProps) {
  const t = useTranslations();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<StreamingInputFormData>({
    resolver: zodResolver(streamingInputSchema),
    defaultValues: {
      message: '',
    },
    mode: 'onChange',
  });

  const messageValue = watch('message');
  const hasMessage = Boolean(messageValue && messageValue.trim().length > 0);
  const isDisabled = isStreaming || !hasMessage;

  // Convert ThreadParticipant[] to ParticipantConfig[] for preview
  const participantConfigs = participants.map(p => ({
    id: p.id,
    modelId: p.modelId,
    role: p.role || '',
    customRoleId: p.customRoleId || undefined,
    order: p.priority,
  }));

  // Merge refs callback for textarea
  const mergeTextareaRefs = useCallback((element: HTMLTextAreaElement | null) => {
    const { ref: rhfRef } = register('message');
    if (typeof rhfRef === 'function') {
      rhfRef(element);
    } else if (rhfRef && 'current' in rhfRef) {
      (rhfRef as MutableRefObject<HTMLTextAreaElement | null>).current = element;
    }

    textareaRef.current = element;
  }, [register]);

  // Auto-resize textarea (min 3 lines = 72px, max 6 lines = 144px)
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 144);
      textarea.style.height = `${newHeight}px`;
    }
  }, [messageValue]);

  // Auto-focus on mount
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleFormSubmit = (data: StreamingInputFormData) => {
    if (isStreaming)
      return;

    onSubmit(data.message);
    reset();
  };

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isDisabled) {
        handleSubmit(handleFormSubmit)();
      }
    }
  };

  const handleClear = () => {
    setValue('message', '');
    textareaRef.current?.focus();
  };

  const handleStop = () => {
    if (onStop) {
      onStop();
    }
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className={cn('w-full max-w-4xl mx-auto space-y-3', className)}>
      {/* Participants Preview - Above Chat Box */}
      {participantConfigs.length > 0 && (
        <ParticipantsPreview participants={participantConfigs} className="mb-2" />
      )}

      <form onSubmit={handleSubmit(handleFormSubmit)}>
        {/* Main Input Container - Glassmorphism */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          className={cn(
            'relative flex flex-col gap-2 rounded-3xl border backdrop-blur-xl bg-background/5 shadow-sm transition-all duration-200 p-3',
            isFocused
              ? 'border-ring ring-2 ring-ring/20'
              : 'border-input hover:border-ring/50',
            isStreaming && 'opacity-75',
          )}
        >
          {/* Textarea - Full Width with Auto-resize */}
          <Textarea
            {...register('message')}
            ref={mergeTextareaRefs}
            placeholder={
              isStreaming
                ? t('chat.input.streamingPlaceholder')
                : t('chat.input.threadPlaceholder')
            }
            disabled={isStreaming}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            className={cn(
              'min-h-[72px] max-h-[144px] resize-none border-0 bg-transparent p-0 shadow-none overflow-y-auto',
              'focus-visible:ring-0 focus-visible:ring-offset-0',
              'placeholder:text-muted-foreground/60 w-full',
              isStreaming && 'cursor-not-allowed',
            )}
            rows={3}
          />

          {/* Bottom Controls Row */}
          <div className="flex items-center gap-2 w-full">
            {/* Mode Display (Read-only) */}
            <Select value={threadMode} disabled>
              <SelectTrigger
                size="sm"
                className="h-8 w-fit gap-2 rounded-full border-0 bg-secondary/50 px-3"
              >
                <SelectValue>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">
                      {CHAT_MODES.find(m => m.value === threadMode)?.icon}
                    </span>
                    <span className="text-xs font-medium">
                      {CHAT_MODES.find(m => m.value === threadMode)?.label}
                    </span>
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CHAT_MODES.map(mode => (
                  <SelectItem key={mode.value} value={mode.value}>
                    <div className="flex items-center gap-2">
                      <span>{mode.icon}</span>
                      <span>{mode.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Right: Action Buttons */}
            <div className="flex items-center gap-2">
              {/* Clear Button (when typing and not streaming) */}
              <AnimatePresence>
                {messageValue && !isStreaming && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={handleClear}
                      className="rounded-full size-8 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-4" />
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Stop Button (when streaming) */}
              <AnimatePresence>
                {isStreaming && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={handleStop}
                      className="rounded-full size-9 bg-destructive/10 text-destructive hover:bg-destructive/20"
                    >
                      <Square className="size-4 fill-current" />
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Send Button (when not streaming) */}
              {!isStreaming && (
                <Button
                  type="submit"
                  size="icon"
                  disabled={isDisabled}
                  className={cn(
                    'rounded-full size-9 transition-all',
                    isDisabled
                      ? 'bg-muted text-muted-foreground pointer-events-none'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90',
                  )}
                >
                  <ArrowUp className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </motion.div>

        {/* Helper Text */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="mt-2 text-xs text-center text-muted-foreground"
        >
          {isStreaming ? t('chat.input.streamingHelperText') : t('chat.input.helperText')}
        </motion.p>

        {/* Error Display */}
        <AnimatePresence>
          {errors.message && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-2 text-xs text-center text-destructive"
            >
              {errors.message.message}
            </motion.p>
          )}
        </AnimatePresence>
      </form>
    </div>
  );
}
