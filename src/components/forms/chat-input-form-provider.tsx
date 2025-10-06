/**
 * Chat Input Form Provider
 *
 * Provides form context for chat input components
 * Uses React Hook Form's FormProvider to eliminate prop drilling
 *
 * Following patterns from /docs/frontend-patterns.md
 */

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import type { ChatInputFormData, ParticipantConfig } from '@/lib/schemas/chat-forms';
import {
  chatInputFormDefaults,
  ChatInputFormSchema,
  ensureMinimumParticipants,
} from '@/lib/schemas/chat-forms';
import type { ThreadMode } from '@/services/api';

// ============================================================================
// Types
// ============================================================================

type ChatInputFormProviderProps = {
  children: ReactNode;
  onSubmit: (data: ChatInputFormData) => void | Promise<void>;
  initialMessage?: string;
  initialMode?: ThreadMode;
  initialParticipants?: ParticipantConfig[];
  disabled?: boolean;
};

// ============================================================================
// Component
// ============================================================================

/**
 * Chat Input Form Provider
 *
 * Wraps chat input form with React Hook Form context
 * Child components can use useFormContext() to access form state
 *
 * @example
 * ```tsx
 * <ChatInputFormProvider onSubmit={handleSubmit}>
 *   <ChatInputField />
 *   <ChatParticipantsField />
 *   <ChatSubmitButton />
 * </ChatInputFormProvider>
 * ```
 */
export function ChatInputFormProvider({
  children,
  onSubmit,
  initialMessage,
  initialMode,
  initialParticipants,
  disabled = false,
}: ChatInputFormProviderProps) {
  // Initialize form with proper defaults
  const methods = useForm<ChatInputFormData>({
    resolver: zodResolver(ChatInputFormSchema),
    defaultValues: {
      message: initialMessage || chatInputFormDefaults.message,
      mode: initialMode || chatInputFormDefaults.mode,
      participants: ensureMinimumParticipants(
        initialParticipants || chatInputFormDefaults.participants,
      ),
      memoryIds: chatInputFormDefaults.memoryIds,
    },
    // Validate on all interactions for immediate feedback
    mode: 'all',
    disabled,
  });

  // Sync form values with prop changes
  useEffect(() => {
    if (initialMessage) {
      methods.setValue('message', initialMessage);
    }
  }, [initialMessage, methods]);

  useEffect(() => {
    if (initialMode) {
      methods.setValue('mode', initialMode);
    }
  }, [initialMode, methods]);

  useEffect(() => {
    if (initialParticipants && initialParticipants.length > 0) {
      methods.setValue('participants', ensureMinimumParticipants(initialParticipants));
    }
  }, [initialParticipants, methods]);

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(onSubmit)}>{children}</form>
    </FormProvider>
  );
}
