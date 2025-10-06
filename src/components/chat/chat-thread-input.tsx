'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowUp, Square, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { KeyboardEventHandler } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { MessageContentSchema } from '@/api/routes/chat/schema';
import type { ParticipantConfig } from '@/components/chat/chat-config-sheet';
import { ChatMemoriesList } from '@/components/chat/chat-memories-list';
import { ChatParticipantsList, ParticipantsPreview } from '@/components/chat/chat-participants-list';
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
 * Thread input form validation schema
 * Reuses backend MessageContentSchema to ensure consistency
 */
const threadInputSchema = z.object({
  message: MessageContentSchema,
});

type ThreadInputFormData = z.infer<typeof threadInputSchema>;

// ============================================================================
// Component Props
// ============================================================================

type ChatThreadInputProps = {
  mode: ThreadMode;
  participants: ParticipantConfig[];
  memoryIds: string[];
  isStreaming: boolean;
  currentParticipantIndex?: number;
  disabled?: boolean; // Disable input (e.g., when error occurs)
  chatMessages?: Array<{ participantId?: string | null; [key: string]: unknown }>; // For participant state detection
  onModeChange: (mode: ThreadMode) => void;
  onParticipantsChange: (participants: ParticipantConfig[]) => void;
  onMemoryIdsChange: (memoryIds: string[]) => void;
  onSubmit: (message: string) => void;
  onStop: () => void;
  className?: string;
};

// ============================================================================
// Component
// ============================================================================

/**
 * Chat Thread Input Component
 *
 * Identical UI to ChatInput but for existing threads:
 * - Same rounded input box design
 * - Dynamic mode selector (can be changed during conversation)
 * - Dynamic participant management (can add/remove/reorder at any time)
 * - Dynamic memory attachment (can attach/detach during conversation)
 * - Streaming support with stop button
 *
 * Design matches ChatGPT-style interface
 * Following patterns from /docs/frontend-patterns.md
 */
export function ChatThreadInput({
  mode,
  participants,
  memoryIds,
  isStreaming,
  currentParticipantIndex,
  disabled = false,
  chatMessages,
  onModeChange,
  onParticipantsChange,
  onMemoryIdsChange,
  onSubmit,
  onStop,
  className,
}: ChatThreadInputProps) {
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
  } = useForm<ThreadInputFormData>({
    resolver: zodResolver(threadInputSchema),
    defaultValues: {
      message: '',
    },
    mode: 'onChange',
  });

  const messageValue = watch('message');
  const hasMessage = Boolean(messageValue && messageValue.trim().length > 0);
  const isDisabled = disabled || isStreaming || !hasMessage;

  // Merge refs callback for textarea
  const mergeTextareaRefs = useCallback((element: HTMLTextAreaElement | null) => {
    const { ref: rhfRef } = register('message');
    if (typeof rhfRef === 'function') {
      rhfRef(element);
    } else if (rhfRef && 'current' in rhfRef) {
      (rhfRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = element;
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

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleFormSubmit = async (data: ThreadInputFormData) => {
    // Call parent's onSubmit with the message content
    onSubmit(data.message);
    // Clear the form after submission
    reset();
  };

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming) {
        handleSubmit(handleFormSubmit)();
      }
    }
  };

  const handleClear = () => {
    setValue('message', '');
    textareaRef.current?.focus();
  };

  const handleStopStreaming = () => {
    onStop();
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className={cn('w-full space-y-3', className)}>
      {/* Participants Preview - Above Chat Box - Shows streaming status */}
      {participants.length > 0 && (
        <ParticipantsPreview
          participants={participants}
          isStreaming={isStreaming}
          currentParticipantIndex={currentParticipantIndex}
          chatMessages={chatMessages}
          className="mb-2"
        />
      )}

      <form onSubmit={handleSubmit(handleFormSubmit)}>
        {/* Main Input Container - No blur on container, blur on individual elements */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          className={cn(
            'relative flex flex-col gap-2 rounded-2xl sm:rounded-3xl p-2.5 sm:p-3 border backdrop-blur-xl',
            'shadow-sm transition-all duration-200',
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
            placeholder={t('chat.input.threadPlaceholder')}
            disabled={disabled || isStreaming}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            className={cn(
              'min-h-[56px] sm:min-h-[72px] max-h-[120px] sm:max-h-[144px] resize-none border-0 bg-transparent p-0 shadow-none overflow-y-auto',
              'focus-visible:ring-0 focus-visible:ring-offset-0',
              'placeholder:text-muted-foreground/60 text-sm sm:text-base w-full',
            )}
            rows={2}
          />

          {/* Bottom Controls Row */}
          <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 w-full">
            {/* Left: AI and Memory Buttons - Dynamic Configuration */}
            <ChatParticipantsList
              participants={participants}
              onParticipantsChange={onParticipantsChange}
              isStreaming={isStreaming}
            />

            <ChatMemoriesList
              selectedMemoryIds={memoryIds}
              onMemoryIdsChange={onMemoryIdsChange}
              isStreaming={isStreaming}
            />

            {/* Mode Selector - Dynamic, can be changed during conversation */}
            <Select value={mode} onValueChange={onModeChange}>
              <SelectTrigger
                size="sm"
                className="h-8 sm:h-9 w-fit gap-1.5 sm:gap-2 rounded-full border px-3 sm:px-4 text-xs"
              >
                <SelectValue>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className="text-xs sm:text-sm">
                      {CHAT_MODES.find(m => m.value === mode)?.icon}
                    </span>
                    <span className="text-xs font-medium hidden xs:inline sm:inline">
                      {CHAT_MODES.find(m => m.value === mode)?.label}
                    </span>
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CHAT_MODES.map(chatMode => (
                  <SelectItem key={chatMode.value} value={chatMode.value}>
                    <div className="flex items-center gap-2">
                      <span>{chatMode.icon}</span>
                      <span className="text-sm">{chatMode.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Spacer */}
            <div className="flex-1 min-w-[8px]" />

            {/* Right: Clear Button and Send/Stop Button */}
            <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
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
                      className="rounded-full size-8 sm:size-9 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-4 sm:size-4.5" />
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Send Button (when not streaming) / Stop Button (when streaming) */}
              {isStreaming
                ? (
                    <Button
                      type="button"
                      size="icon"
                      onClick={handleStopStreaming}
                      className="rounded-full size-9 sm:size-10 bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-95 transition-transform"
                    >
                      <Square className="size-4 sm:size-4.5" />
                    </Button>
                  )
                : (
                    <Button
                      type="submit"
                      size="icon"
                      disabled={isDisabled}
                      className={cn(
                        'rounded-full size-9 sm:size-10 transition-all active:scale-95',
                        isDisabled
                          ? 'bg-muted text-muted-foreground pointer-events-none'
                          : 'bg-primary text-primary-foreground hover:bg-primary/90',
                      )}
                    >
                      <ArrowUp className="size-4 sm:size-4.5" />
                    </Button>
                  )}
            </div>
          </div>
        </motion.div>

        {/* Streaming Progress Indicator - Show which participant is responding */}
        <AnimatePresence>
          {isStreaming && currentParticipantIndex !== undefined && participants.length > 1 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-2 sm:mt-3 flex items-center justify-center gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-primary/10 border border-primary/30"
            >
              {/* Participant avatars with progress */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                {participants.map((participant, idx) => {
                  const isCurrent = idx === currentParticipantIndex;
                  const hasResponded = idx < currentParticipantIndex;
                  const isWaiting = idx > currentParticipantIndex;

                  return (
                    <div
                      key={participant.id || idx}
                      className={cn(
                        'flex items-center gap-1 sm:gap-1.5 transition-all duration-300',
                        isCurrent && 'scale-110',
                      )}
                    >
                      <div
                        className={cn(
                          'size-1 sm:size-1.5 rounded-full transition-all',
                          hasResponded && 'bg-green-500',
                          isCurrent && 'bg-primary animate-pulse',
                          isWaiting && 'bg-muted-foreground/30',
                        )}
                      />
                      {idx < participants.length - 1 && (
                        <div className="w-3 sm:w-4 h-px bg-border" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Current participant info */}
              <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs">
                <span className="font-medium text-primary truncate max-w-[100px] sm:max-w-none">
                  {participants[currentParticipantIndex]?.role || `Model ${currentParticipantIndex + 1}`}
                </span>
                <span className="text-muted-foreground shrink-0">
                  (
                  {currentParticipantIndex + 1}
                  /
                  {participants.length}
                  )
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Helper Text */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="mt-2 text-xs text-center text-muted-foreground"
        >
          {isStreaming && participants.length > 1
            ? `Waiting for all ${participants.length} participants to respond...`
            : t('chat.input.helperText')}
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
