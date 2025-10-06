'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowUp, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { KeyboardEventHandler } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { MessageContentSchema, ThreadModeSchema } from '@/api/routes/chat/schema';
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
import { toast } from '@/components/ui/use-toast';
import { useCreateThreadMutation } from '@/hooks/mutations/chat-mutations';
import { cn } from '@/lib/ui/cn';
import { chatGlass } from '@/lib/ui/glassmorphism';
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
 * Chat input form validation schema
 * Reuses backend validation schemas to ensure consistency:
 * - MessageContentSchema: min 1, max 5000 characters (from backend)
 * - ThreadModeSchema: enum validation (from backend)
 */
const chatInputSchema = z.object({
  message: MessageContentSchema,
  mode: ThreadModeSchema,
});

type ChatInputFormData = z.infer<typeof chatInputSchema>;

// ============================================================================
// Component Props
// ============================================================================

type ChatInputProps = {
  className?: string;
  onThreadCreated?: (threadId: string, threadSlug: string, firstMessage: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  initialMessage?: string;
  initialMode?: ThreadMode;
  initialParticipants?: ParticipantConfig[];
};

// ============================================================================
// Component
// ============================================================================

/**
 * Enhanced Chat Input Component
 *
 * Modern ChatGPT-style input with:
 * - Attachment menu (photos, 3D objects, files)
 * - Mode selector dropdown
 * - Auto-resizing textarea
 * - Smooth animations
 * - Loading states
 *
 * Design inspired by modern AI chat interfaces
 * Following patterns from /docs/frontend-patterns.md
 */
export function ChatInput({
  className,
  onThreadCreated,
  autoFocus = false,
  disabled = false,
  initialMessage = '',
  initialMode = 'brainstorming',
  initialParticipants,
}: ChatInputProps) {
  const t = useTranslations();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Advanced configuration state - use initialParticipants if provided, otherwise default
  const [participants, setParticipants] = useState<ParticipantConfig[]>(
    initialParticipants || [
      {
        id: 'participant-default',
        modelId: 'anthropic/claude-3.5-sonnet', // Claude 3.5 Sonnet - matches models-config.ts
        role: '', // No role by default
        order: 0,
      },
    ],
  );
  const [selectedMemoryIds, setSelectedMemoryIds] = useState<string[]>([]);

  const createThreadMutation = useCreateThreadMutation();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ChatInputFormData>({
    resolver: zodResolver(chatInputSchema),
    defaultValues: {
      message: initialMessage,
      mode: initialMode,
    },
    mode: 'onChange', // Enable onChange mode for real-time validation
  });

  // Update form values when initial props change
  useEffect(() => {
    if (initialMessage) {
      setValue('message', initialMessage);
      // Auto-resize textarea
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      }
    }
  }, [initialMessage, setValue]);

  useEffect(() => {
    if (initialMode) {
      setValue('mode', initialMode);
    }
  }, [initialMode, setValue]);

  // Update participants when initialParticipants change
  useEffect(() => {
    if (initialParticipants && initialParticipants.length > 0) {
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Syncing state with prop changes
      setParticipants(initialParticipants);
    }
  }, [initialParticipants]);

  const messageValue = watch('message');
  const modeValue = watch('mode');
  const isSubmitting = createThreadMutation.isPending;
  const hasMessage = Boolean(messageValue && messageValue.trim().length > 0);
  const isDisabled = disabled || isSubmitting || !hasMessage;

  // Merge refs callback for textarea (RHF ref + our ref for auto-resize)
  const mergeTextareaRefs = useCallback((element: HTMLTextAreaElement | null) => {
    // Apply RHF's ref
    const { ref: rhfRef } = register('message');
    if (typeof rhfRef === 'function') {
      rhfRef(element);
    } else if (rhfRef && 'current' in rhfRef) {
      (rhfRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = element;
    }

    // Apply our ref for auto-resize
    textareaRef.current = element;
  }, [register]);

  // Auto-resize textarea (min 3 lines = 72px, max 6 lines = 144px)
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to recalculate scroll height
      textarea.style.height = 'auto';

      // Calculate new height, capped at 144px (6 lines)
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

  const onSubmit = async (data: ChatInputFormData) => {
    try {
      const result = await createThreadMutation.mutateAsync({
        json: {
          firstMessage: data.message,
          title: 'New Chat',
          mode: data.mode,
          // Sort participants by order field before sending to API
          // This ensures database priority matches the configured order
          participants: participants
            .sort((a, b) => a.order - b.order)
            .map(p => ({
              modelId: p.modelId,
              ...(p.role && { role: p.role }), // Only include role if it exists
              ...(p.customRoleId && { customRoleId: p.customRoleId }), // Only include customRoleId if it exists
            })),
          memoryIds: selectedMemoryIds.length > 0 ? selectedMemoryIds : undefined,
        },
      });

      if (result.success && result.data) {
        reset();
        const thread = result.data.thread;

        // Call parent callback with thread details - parent handles navigation
        if (onThreadCreated) {
          onThreadCreated(thread.id, thread.slug, data.message);
        }

        toast({
          title: t('notifications.success.createSuccess'),
          description: t('chat.threadCreated'),
        });
      } else {
        throw new Error('Failed to create thread');
      }
    } catch (error) {
      console.error('Failed to create thread:', error);
      toast({
        title: t('notifications.error.createFailed'),
        description: t('chat.threadCreationFailed'),
        variant: 'destructive',
      });
    }
  };

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(onSubmit)();
    }
  };

  const handleClear = () => {
    setValue('message', '');
    textareaRef.current?.focus();
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className={cn('w-full space-y-3', className)}>
      {/* Participants Preview - Above Chat Box - Always show selected participants */}
      {participants.length > 0 && (
        <ParticipantsPreview participants={participants} className="mb-2" />
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Main Input Container - Glassmorphism */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          className={cn(
            chatGlass.inputBox,
            'relative flex flex-col gap-2 rounded-3xl p-3',
            isFocused && 'ring-2 ring-white/20',
          )}
        >
          {/* Textarea - Full Width with Auto-resize */}
          <Textarea
            {...register('message')}
            ref={mergeTextareaRefs}
            placeholder={t('chat.input.placeholder')}
            disabled={disabled || isSubmitting}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            className={cn(
              'min-h-[72px] max-h-[144px] resize-none border-0 bg-transparent p-0 shadow-none overflow-y-auto',
              'focus-visible:ring-0 focus-visible:ring-offset-0',
              'placeholder:text-muted-foreground/60 w-full',
            )}
            rows={3}
          />

          {/* Bottom Controls Row */}
          <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 w-full">
            {/* Left: AI and Memory Buttons */}
            <ChatParticipantsList
              participants={participants}
              onParticipantsChange={setParticipants}
            />

            <ChatMemoriesList
              selectedMemoryIds={selectedMemoryIds}
              onMemoryIdsChange={setSelectedMemoryIds}
            />

            {/* Mode Selector */}
            <Select value={modeValue} onValueChange={value => setValue('mode', value as typeof modeValue)}>
              <SelectTrigger
                size="sm"
                className="h-8 sm:h-9 w-fit gap-1.5 sm:gap-2 rounded-full border px-3 sm:px-4 text-xs"
              >
                <SelectValue>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className="text-xs sm:text-sm">
                      {CHAT_MODES.find(m => m.value === modeValue)?.icon}
                    </span>
                    <span className="text-xs font-medium hidden xs:inline sm:inline">
                      {CHAT_MODES.find(m => m.value === modeValue)?.label}
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
            <div className="flex-1 min-w-[8px]" />

            {/* Right: Clear Button and Send Button */}
            <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
              {/* Clear Button (when typing) */}
              <AnimatePresence>
                {messageValue && !isSubmitting && (
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

              {/* Send Button */}
              <Button
                type="submit"
                size="icon"
                disabled={isDisabled}
                loading={isSubmitting}
                className={cn(
                  'rounded-full size-9 transition-all',
                  isDisabled
                    ? 'bg-muted text-muted-foreground pointer-events-none'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90',
                )}
              >
                {!isSubmitting && <ArrowUp className="size-4" />}
              </Button>
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
          {t('chat.input.helperText')}
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
