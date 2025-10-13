/**
 * Chat Form Hooks
 *
 * Reusable hooks for accessing chat form state
 * Separated from components for proper fast refresh
 */

import { useFormContext } from 'react-hook-form';

import type { ChatInputFormData } from '@/lib/schemas/chat-forms';

/**
 * Hook to access chat form state
 * Use this in custom components that need direct form access
 */
export function useChatFormState() {
  const { watch, setValue, formState } = useFormContext<ChatInputFormData>();

  return {
    message: watch('message'),
    mode: watch('mode'),
    participants: watch('participants'),
    setValue,
    errors: formState.errors,
    isSubmitting: formState.isSubmitting,
    isValid: formState.isValid,
    isDirty: formState.isDirty,
  };
}

/**
 * Hook to check if form can be submitted
 * Validates against the same rules as backend API schemas:
 * - MessageContentSchema: min 1, max 5000 characters
 * - ParticipantConfigSchema: at least 1 participant required
 */
export function useChatFormValidation() {
  const { watch, formState } = useFormContext<ChatInputFormData>();
  const message = watch('message') ?? '';
  const participants = watch('participants') ?? [];

  // Backend validation rules (from MessageContentSchema)
  const trimmedMessage = String(message).trim();
  const hasMessage = trimmedMessage.length > 0;
  const isMessageValid = hasMessage && trimmedMessage.length <= 5000;

  // Backend validation rules (from ChatInputFormSchema.participants.min(1))
  const hasParticipants = Array.isArray(participants) && participants.length > 0;

  // Manual validation that mirrors backend schemas
  // This ensures button state updates immediately without waiting for RHF async validation
  const canSubmit = hasMessage && isMessageValid && hasParticipants;

  return {
    hasMessage,
    hasParticipants,
    isMessageValid,
    canSubmit,
    errors: formState.errors,
  };
}
