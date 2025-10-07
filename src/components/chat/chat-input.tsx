/**
 * Chat Input Component
 *
 * Modern ChatGPT-style input with proper RHF patterns:
 * - Uses FormProvider to eliminate prop drilling
 * - Leverages useFormContext in child components
 * - No duplicate state management
 * - Clean, maintainable architecture
 *
 * Following patterns from /docs/frontend-patterns.md and /docs/form-patterns.md
 */

'use client';

import { ArrowUp, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { KeyboardEventHandler } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { useFormContext } from 'react-hook-form';

import { ParticipantsPreview } from '@/components/chat/chat-participants-list';
import {
  ChatMemoriesField,
  ChatModeField,
  ChatParticipantsField,
} from '@/components/forms/chat-form-fields';
import { ChatInputFormProvider } from '@/components/forms/chat-input-form-provider';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { useChatFormValidation } from '@/hooks/forms/use-chat-form';
import { useCreateThreadMutation } from '@/hooks/mutations/chat-mutations';
import type { ChatInputFormData, ParticipantConfig } from '@/lib/schemas/chat-forms';
import { chatInputFormToCreateThreadRequest } from '@/lib/schemas/chat-forms';
import { cn } from '@/lib/ui/cn';
import { chatGlass } from '@/lib/ui/glassmorphism';
import { getApiErrorMessage } from '@/lib/utils/error-handling';
import type { ThreadMode } from '@/services/api';

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
// Inner Component (with Form Context)
// ============================================================================

function ChatInputInner({
  autoFocus = false,
  disabled = false,
}: Omit<ChatInputProps, 'initialMessage' | 'initialMode' | 'initialParticipants' | 'className' | 'onThreadCreated'>) {
  const t = useTranslations();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Use form context instead of local state
  const { register, watch, setValue, formState } = useFormContext<ChatInputFormData>();
  const { hasMessage, hasParticipants, canSubmit } = useChatFormValidation();

  const messageValue = watch('message') ?? '';
  const participantsValue = watch('participants') ?? [];

  const createThreadMutation = useCreateThreadMutation();
  const isSubmitting = createThreadMutation.isPending;

  // Button should be disabled if: loading, no message, no participants, or form invalid
  const isButtonDisabled = disabled || isSubmitting || !canSubmit;

  // Debug validation state (development only)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const messageLen = typeof messageValue === 'string' ? messageValue.length : 0;
      const participantsCount = Array.isArray(participantsValue) ? participantsValue.length : 0;

      // eslint-disable-next-line no-console
      console.log('[ChatInput] Validation state:', {
        hasMessage,
        hasParticipants,
        canSubmit,
        isButtonDisabled,
        messageLength: messageLen,
        participantsCount,
        messageValue,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMessage, hasParticipants, canSubmit, isButtonDisabled]);

  // Get full registration from RHF (includes onChange, onBlur, ref, name)
  const messageRegistration = register('message');

  // Auto-resize textarea (min 3 lines = 72px, max 6 lines = 144px)
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 144);
      textarea.style.height = `${newHeight}px`;
    }
  }, [messageValue]);

  // Auto-focus on mount (conditional based on user preference)
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      // Use setTimeout to avoid potential accessibility issues
      const timeoutId = setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
      return () => {
        clearTimeout(timeoutId);
      };
    }
    return undefined;
  }, [autoFocus]);

  // Handle keyboard shortcuts
  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = useCallback(
    (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (!isButtonDisabled && textareaRef.current) {
          const form = textareaRef.current.form;
          if (form) {
            form.requestSubmit();
          }
        }
      }
    },
    [isButtonDisabled],
  );

  return (
    <div className="w-full space-y-3">
      {/* Participants Preview */}
      {participantsValue.length > 0 && (
        <ParticipantsPreview participants={participantsValue} className="mb-2" />
      )}

      {/* Main Input Container */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className={cn(
          'relative w-full overflow-hidden rounded-3xl',
          chatGlass.inputBox,
        )}
      >
        {/* Textarea */}
        <Textarea
          {...messageRegistration}
          ref={(e) => {
            messageRegistration.ref(e);
            textareaRef.current = e;
          }}
          placeholder={t('chat.input.placeholder')}
          disabled={disabled || isSubmitting}
          onKeyDown={handleKeyDown}
          className={cn(
            'min-h-[72px] max-h-[144px] resize-none border-0 bg-transparent px-4 py-3',
            'text-sm leading-relaxed placeholder:text-muted-foreground/60',
            'focus-visible:ring-0 focus-visible:ring-offset-0',
            'scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent',
          )}
          aria-label={t('chat.input.placeholder')}
        />

        {/* Bottom Controls */}
        <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 w-full px-3 sm:px-4 pb-3">
          <ChatParticipantsField />
          <ChatMemoriesField />
          <ChatModeField
            className="h-8 sm:h-9 w-fit gap-1.5 sm:gap-2 rounded-full border px-3 sm:px-4 text-xs"
            size="sm"
          />

          {/* Spacer */}
          <div className="flex-1 min-w-[8px]" />

          {/* Clear Button */}
          {hasMessage && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 sm:size-9 rounded-full"
              onClick={() => {
                setValue('message', '', { shouldValidate: true });
                textareaRef.current?.focus();
              }}
              disabled={isSubmitting}
            >
              <X className="size-4" />
            </Button>
          )}

          {/* Send Button */}
          <Button
            type="submit"
            size="icon"
            className="size-8 sm:size-9 rounded-full"
            disabled={isButtonDisabled}
          >
            <ArrowUp className="size-4" />
          </Button>
        </div>

      </motion.div>

      {/* Helper Text & Errors - Outside input box */}
      <div className="mt-2 space-y-1">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="text-xs text-center text-muted-foreground"
        >
          {t('chat.input.helperText')}
        </motion.p>

        <AnimatePresence>
          {!hasParticipants && !isSubmitting && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-xs text-center text-destructive"
            >
              Please select at least one AI model to start the conversation
            </motion.p>
          )}
          {formState.errors.message && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-xs text-center text-destructive"
            >
              {formState.errors.message.message}
            </motion.p>
          )}
          {formState.errors.participants && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-xs text-center text-destructive"
            >
              {formState.errors.participants.message}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component (with Provider)
// ============================================================================

/**
 * Chat Input Component
 *
 * Provides a form context wrapper for clean state management
 * All child components use useFormContext for accessing form state
 */
export function ChatInput({
  className,
  onThreadCreated,
  autoFocus,
  disabled,
  initialMessage,
  initialMode,
  initialParticipants,
}: ChatInputProps) {
  const t = useTranslations();
  const createThreadMutation = useCreateThreadMutation();

  const handleSubmit = useCallback(
    async (data: ChatInputFormData) => {
      try {
        const requestData = chatInputFormToCreateThreadRequest(data);

        const result = await createThreadMutation.mutateAsync({
          json: requestData,
        });

        if (result.success && result.data) {
          const thread = result.data.thread;
          if (onThreadCreated) {
            onThreadCreated(thread.id, thread.slug, data.message);
          }
        }
      } catch (error) {
        console.error('Failed to create thread:', error);
        const errorMessage = getApiErrorMessage(error, t('chat.threadCreationFailed'));
        toast({
          variant: 'destructive',
          title: t('notifications.error.createFailed'),
          description: errorMessage,
        });
      }
    },
    [createThreadMutation, onThreadCreated, t],
  );

  return (
    <div className={className}>
      <ChatInputFormProvider
        onSubmit={handleSubmit}
        initialMessage={initialMessage}
        initialMode={initialMode}
        initialParticipants={initialParticipants}
        disabled={disabled}
      >
        <ChatInputInner
          // eslint-disable-next-line jsx-a11y/no-autofocus -- Used programmatically in useEffect, not directly on element
          autoFocus={autoFocus}
          disabled={disabled}
        />
      </ChatInputFormProvider>
    </div>
  );
}
