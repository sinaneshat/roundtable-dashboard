/**
 * Unified Chat Input Component
 *
 * Single reusable chat input for both:
 * - Creating new threads (ChatOverviewScreen)
 * - Sending messages in existing threads (ChatThreadScreen)
 *
 * Following AI SDK v5 patterns from official documentation:
 * - Simple state management with useState
 * - Parent component handles business logic
 * - Clean separation of concerns
 * - No duplicate code
 *
 * Based on:
 * - https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot
 * - /docs/frontend-patterns.md
 */

'use client';

import { ArrowUp, Square, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { FormEvent, KeyboardEventHandler } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

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
import { getChatModeOptions } from '@/lib/config/chat-modes';
import { cn } from '@/lib/ui/cn';
import { chatGlass } from '@/lib/ui/glassmorphism';
import type { ThreadMode } from '@/services/api';

// ============================================================================
// Component Props
// ============================================================================

type UnifiedChatInputProps = {
  // Core props
  mode: ThreadMode;
  participants: ParticipantConfig[];
  memoryIds: string[];

  // State flags
  isStreaming?: boolean; // Only for existing threads
  isCreating?: boolean; // Only for creating new threads
  currentParticipantIndex?: number; // For multi-participant streaming display
  disabled?: boolean;

  // Callbacks
  onSubmit: (message: string) => void | Promise<void>;
  onStop?: () => void; // Only needed for streaming in existing threads
  onModeChange: (mode: ThreadMode) => void;
  onParticipantsChange: (participants: ParticipantConfig[]) => void;
  onMemoryIdsChange: (memoryIds: string[]) => void;

  // Optional controlled message state
  message?: string;
  onMessageChange?: (message: string) => void;

  // Optional
  chatMessages?: Array<{ participantId?: string | null; [key: string]: unknown }>; // For participant state detection
  className?: string;
  autoFocus?: boolean;
  placeholder?: string;
};

// ============================================================================
// Component
// ============================================================================

/**
 * Unified Chat Input Component
 *
 * ChatGPT-style input following AI SDK v5 patterns:
 * - Simple state management (no heavy form library for input)
 * - Auto-expanding textarea with Enter/Shift+Enter handling
 * - Dynamic mode selector, participant, and memory management
 * - Streaming support with stop button (for existing threads)
 * - Loading support (for creating new threads)
 * - Reusable across both ChatOverviewScreen and ChatThreadScreen
 */
export function UnifiedChatInput({
  mode,
  participants,
  memoryIds,
  isStreaming = false,
  isCreating = false,
  currentParticipantIndex,
  disabled = false,
  onSubmit,
  onStop,
  onModeChange,
  onParticipantsChange,
  onMemoryIdsChange,
  message: controlledMessage,
  onMessageChange,
  chatMessages,
  className,
  autoFocus = false,
  placeholder,
}: UnifiedChatInputProps) {
  const t = useTranslations();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // ✅ AI SDK v5 Pattern: Simple useState for input management
  // Ref: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot
  // Support both controlled and uncontrolled modes
  const [internalMessage, setInternalMessage] = useState('');
  const isControlled = controlledMessage !== undefined;
  const message = isControlled ? controlledMessage : internalMessage;
  const setMessage = isControlled ? (onMessageChange || (() => {})) : setInternalMessage;

  const hasMessage = Boolean(message && message.trim().length > 0);
  const hasParticipants = participants.length > 0;
  const isBusy = isStreaming || isCreating;

  // Allow typing during streaming for interruption, but disable submit
  const isTextareaDisabled = disabled; // Only disable if explicitly disabled (errors)
  const isSubmitDisabled = disabled || isBusy || !hasMessage || !hasParticipants;

  const chatModeOptions = getChatModeOptions();

  // Auto-resize textarea (min 3 lines = 72px, max 6 lines = 144px)
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 144);
      textarea.style.height = `${newHeight}px`;
    }
  }, [message]);

  // Auto-focus on mount (conditional)
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      const timeoutId = setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
      return () => {
        clearTimeout(timeoutId);
      };
    }
    return undefined;
  }, [autoFocus]);

  // ============================================================================
  // Handlers - Following AI SDK v5 Patterns
  // ============================================================================

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();

      if (isSubmitDisabled || !hasMessage)
        return;

      const messageToSend = message.trim();

      // ✅ AI SDK v5 Pattern: Clear input immediately before sending
      setMessage('');

      // Call parent's onSubmit
      await onSubmit(messageToSend);
    },
    [isSubmitDisabled, hasMessage, message, onSubmit, setMessage],
  );

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!isBusy && textareaRef.current) {
          const form = textareaRef.current.form;
          if (form) {
            form.requestSubmit();
          }
        }
      }
    },
    [isBusy],
  );

  const handleClear = useCallback(() => {
    setMessage('');
    textareaRef.current?.focus();
  }, []);

  const handleStopStreaming = useCallback(() => {
    if (onStop) {
      onStop();
    }
  }, [onStop]);

  // ============================================================================
  // Render
  // ============================================================================

  const effectivePlaceholder = placeholder || (isStreaming || isCreating
    ? t('chat.input.threadPlaceholder')
    : t('chat.input.placeholder'));

  return (
    <div className={cn('w-full space-y-3', className)}>
      {/* Participants Preview - Above Chat Box */}
      {participants.length > 0 && (
        <ParticipantsPreview
          participants={participants}
          isStreaming={isStreaming}
          currentParticipantIndex={currentParticipantIndex}
          chatMessages={chatMessages}
          className="mb-2"
        />
      )}

      <form onSubmit={handleSubmit}>
        {/* Main Input Container */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          className={cn(
            'relative flex flex-col gap-2 rounded-3xl p-2.5 sm:p-3',
            chatGlass.inputBox,
            isFocused && 'ring-2 ring-ring/20',
            isBusy && 'opacity-75',
          )}
        >
          {/* Textarea - Auto-resize with Enter/Shift+Enter handling */}
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={effectivePlaceholder}
            disabled={isTextareaDisabled}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            className={cn(
              'min-h-[56px] sm:min-h-[72px] max-h-[120px] sm:max-h-[144px] resize-none border-0 bg-transparent p-0 shadow-none overflow-y-auto',
              'focus-visible:ring-0 focus-visible:ring-offset-0',
              'placeholder:text-muted-foreground/60 text-sm sm:text-base w-full',
            )}
            rows={2}
            aria-label={effectivePlaceholder}
          />

          {/* Bottom Controls Row */}
          <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 w-full">
            {/* Left: AI and Memory Buttons - Dynamic Configuration */}
            <ChatParticipantsList
              participants={participants}
              onParticipantsChange={onParticipantsChange}
              isStreaming={isBusy}
            />

            <ChatMemoriesList
              selectedMemoryIds={memoryIds}
              onMemoryIdsChange={onMemoryIdsChange}
              isStreaming={isBusy}
            />

            {/* Mode Selector - Always enabled to allow mode changes in existing threads */}
            <Select value={mode} onValueChange={onModeChange}>
              <SelectTrigger
                size="sm"
                className="h-8 sm:h-9 w-fit gap-1.5 sm:gap-2 rounded-full border px-3 sm:px-4 text-xs"
              >
                <SelectValue>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    {(() => {
                      const ModeIcon = chatModeOptions.find(m => m.value === mode)?.icon;
                      return ModeIcon ? <ModeIcon className="size-3 sm:size-3.5" /> : null;
                    })()}
                    <span className="text-xs font-medium hidden xs:inline sm:inline">
                      {chatModeOptions.find(m => m.value === mode)?.label}
                    </span>
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {chatModeOptions.map((chatMode) => {
                  const ModeIcon = chatMode.icon;
                  return (
                    <SelectItem key={chatMode.value} value={chatMode.value}>
                      <div className="flex items-center gap-2">
                        <ModeIcon className="size-4" />
                        <span className="text-sm">{chatMode.label}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            {/* Spacer */}
            <div className="flex-1 min-w-[8px]" />

            {/* Right: Clear Button and Send/Stop Button */}
            <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
              {/* Clear Button (when typing and not busy) */}
              <AnimatePresence>
                {message && !isBusy && (
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

              {/* Send Button (when not busy) / Stop Button (when streaming) */}
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
                      disabled={isSubmitDisabled}
                      className={cn(
                        'rounded-full size-9 sm:size-10 transition-all active:scale-95',
                        isSubmitDisabled
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
          {!hasParticipants && !isBusy && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-2 text-xs text-center text-muted-foreground"
            >
              {t('chat.input.noParticipants') || 'Please select at least one AI model to continue'}
            </motion.p>
          )}
        </AnimatePresence>
      </form>
    </div>
  );
}
