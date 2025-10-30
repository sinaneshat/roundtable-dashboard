/**
 * Chat Form Actions Hook
 *
 * Zustand v5 Pattern: Store-specific action hook co-located with store
 * Bridges form state with mutations and orchestrates form submission logic.
 *
 * Location: /src/stores/chat/actions/form-actions.ts
 * Used by: ChatOverviewScreen, ChatThreadScreen
 */

'use client';

import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { toCreateThreadRequest } from '@/components/chat/chat-form-schemas';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { useCreateThreadMutation, useUpdateThreadMutation } from '@/hooks/mutations/chat-mutations';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { showApiErrorToast } from '@/lib/toast';
import { transformChatMessages, transformChatParticipants, transformChatThread } from '@/lib/utils/date-transforms';
import { chatMessagesToUIMessages } from '@/lib/utils/message-transforms';

export type UseChatFormActionsReturn = {
  /** Submit form to create new thread */
  handleCreateThread: () => Promise<void>;
  /** Submit form to update existing thread and send message */
  handleUpdateThreadAndSend: (threadId: string) => Promise<void>;
  /** Reset form to initial state */
  handleResetForm: () => void;
  /** Change mode and mark as having pending changes */
  handleModeChange: (mode: ChatModeId) => void;
  /** Check if form is valid for submission */
  isFormValid: boolean;
};

/**
 * Hook for managing chat form actions with store + mutations
 *
 * Orchestrates form submission logic for both thread creation and updates.
 * Eliminates the need for local state and complex useEffect chains.
 *
 * @example
 * const formActions = useChatFormActions()
 *
 * // In Overview screen (create thread)
 * await formActions.handleCreateThread()
 *
 * // In Thread screen (update thread)
 * await formActions.handleUpdateThreadAndSend(threadId)
 */
export function useChatFormActions(): UseChatFormActionsReturn {
  // Batch form state selectors with useShallow for performance
  const formState = useChatStore(useShallow(s => ({
    inputValue: s.inputValue,
    selectedMode: s.selectedMode,
    selectedParticipants: s.selectedParticipants,
  })));

  // Batch thread state selectors
  const threadState = useChatStore(useShallow(s => ({
    thread: s.thread,
    participants: s.participants,
  })));

  // Batch actions selectors (functions are stable, but batching reduces subscriptions)
  const actions = useChatStore(useShallow(s => ({
    setInputValue: s.setInputValue,
    resetForm: s.resetForm,
    setSelectedMode: s.setSelectedMode,
    setShowInitialUI: s.setShowInitialUI,
    setIsCreatingThread: s.setIsCreatingThread,
    setWaitingToStartStreaming: s.setWaitingToStartStreaming,
    setCreatedThreadId: s.setCreatedThreadId,
    setHasPendingConfigChanges: s.setHasPendingConfigChanges,
    prepareForNewMessage: s.prepareForNewMessage,
    setExpectedParticipantIds: s.setExpectedParticipantIds,
    initializeThread: s.initializeThread,
    updateParticipants: s.updateParticipants,
  })));

  // Mutations
  const createThreadMutation = useCreateThreadMutation();
  const updateThreadMutation = useUpdateThreadMutation();

  // Form validation
  const isFormValid = Boolean(
    formState.inputValue.trim()
    && formState.selectedParticipants.length > 0
    && formState.selectedMode,
  );

  /**
   * Create a new thread with current form state
   * Used by ChatOverviewScreen
   */
  const handleCreateThread = useCallback(async () => {
    const prompt = formState.inputValue.trim();

    if (!prompt || formState.selectedParticipants.length === 0 || !formState.selectedMode) {
      return;
    }

    try {
      actions.setIsCreatingThread(true);

      const createThreadRequest = toCreateThreadRequest({
        message: prompt,
        mode: formState.selectedMode,
        participants: formState.selectedParticipants,
      });

      const response = await createThreadMutation.mutateAsync({
        json: createThreadRequest,
      });

      const { thread, participants, messages: initialMessages } = response.data;

      // ✅ SINGLE SOURCE OF TRUTH: Use date transform utilities
      const threadWithDates = transformChatThread(thread);
      const participantsWithDates = transformChatParticipants(participants);
      const messagesWithDates = transformChatMessages(initialMessages);

      actions.setShowInitialUI(false);
      actions.setInputValue('');
      actions.setCreatedThreadId(thread.id);

      // ✅ SINGLE SOURCE OF TRUTH: Use utility for type-safe message transformation
      // Replaces unsafe type assertions with validated conversion
      const uiMessages = chatMessagesToUIMessages(messagesWithDates);

      actions.initializeThread(threadWithDates, participantsWithDates, uiMessages);

      // Set flag to trigger streaming once chat is ready
      // Use queueMicrotask to ensure store updates have propagated
      queueMicrotask(() => {
        actions.setWaitingToStartStreaming(true);
      });
    } catch (error) {
      showApiErrorToast('Error creating thread', error);
      actions.setShowInitialUI(true);
    } finally {
      actions.setIsCreatingThread(false);
    }
  }, [
    formState.inputValue,
    formState.selectedMode,
    formState.selectedParticipants,
    createThreadMutation,
    actions,
  ]);

  /**
   * Update existing thread and send message
   * Used by ChatThreadScreen
   */
  const handleUpdateThreadAndSend = useCallback(async (threadId: string) => {
    const trimmed = formState.inputValue.trim();

    if (!trimmed || formState.selectedParticipants.length === 0 || !formState.selectedMode) {
      return;
    }

    try {
      // ✅ CRITICAL FIX: Detect if participants or mode actually changed
      // Compare current state with selected state to avoid unnecessary PATCH requests
      const currentModeId = threadState.thread?.mode || null;
      const hasTemporaryIds = formState.selectedParticipants.some(p => p.id.startsWith('participant-'));

      // Compare participants by modelId and priority (ignore temporary IDs and timestamps)
      const currentParticipantsKey = threadState.participants
        .filter(p => p.isEnabled)
        .sort((a, b) => a.priority - b.priority)
        .map(p => `${p.modelId}:${p.priority}:${p.role || 'null'}:${p.customRoleId || 'null'}`)
        .join('|');

      const selectedParticipantsKey = formState.selectedParticipants
        .sort((a, b) => a.priority - b.priority)
        .map(p => `${p.modelId}:${p.priority}:${p.role || 'null'}:${p.customRoleId || 'null'}`)
        .join('|');

      const participantsChanged = currentParticipantsKey !== selectedParticipantsKey;
      const modeChanged = currentModeId !== formState.selectedMode;
      const hasChanges = hasTemporaryIds || participantsChanged || modeChanged;

      // Prepare participants for update
      const participantsForUpdate = formState.selectedParticipants.map(p => ({
        id: p.id.startsWith('participant-') ? '' : p.id,
        modelId: p.modelId,
        role: p.role || null,
        customRoleId: p.customRoleId || null,
        priority: p.priority,
        isEnabled: true,
      }));

      const optimisticParticipants = formState.selectedParticipants.map((p, index) => ({
        id: p.id,
        threadId,
        modelId: p.modelId,
        role: p.role || null,
        customRoleId: p.customRoleId || null,
        priority: index,
        isEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      // ✅ CRITICAL FIX: Only make PATCH request if something actually changed
      if (hasChanges) {
        // Update participants optimistically
        actions.updateParticipants(optimisticParticipants);

        if (hasTemporaryIds) {
          const response = await updateThreadMutation.mutateAsync({
            param: { id: threadId },
            json: {
              participants: participantsForUpdate,
              mode: formState.selectedMode,
            },
          });

          if (response?.data?.participants) {
            // ✅ SINGLE SOURCE OF TRUTH: Use date transform utility
            const participantsWithDates = transformChatParticipants(response.data.participants);

            actions.updateParticipants(participantsWithDates);
            await new Promise(resolve => queueMicrotask(resolve));
            actions.setExpectedParticipantIds(participantsWithDates.map(p => p.modelId));
          } else {
            actions.setExpectedParticipantIds(optimisticParticipants.map(p => p.modelId));
          }
        } else {
          updateThreadMutation.mutateAsync({
            param: { id: threadId },
            json: {
              participants: participantsForUpdate,
              mode: formState.selectedMode,
            },
          }).catch(() => {
            // Silently fail - optimistic update already applied
          });

          await new Promise(resolve => queueMicrotask(resolve));
          actions.setExpectedParticipantIds(optimisticParticipants.map(p => p.modelId));
        }
      } else {
        // No changes - just use current participants for expected IDs
        await new Promise(resolve => queueMicrotask(resolve));
        actions.setExpectedParticipantIds(threadState.participants.map(p => p.modelId));
      }

      // Prepare for new message (sets flags and pending message)
      actions.prepareForNewMessage(trimmed, []);
    } catch (error) {
      showApiErrorToast('Error updating thread', error);
    }

    actions.setInputValue('');
  }, [
    formState,
    threadState,
    updateThreadMutation,
    actions,
  ]);

  /**
   * Reset form to initial state
   */
  const handleResetForm = useCallback(() => {
    actions.resetForm();
  }, [actions]);

  /**
   * Change mode and mark as having pending changes
   * Used by ChatThreadScreen
   */
  const handleModeChange = useCallback((mode: ChatModeId) => {
    actions.setSelectedMode(mode);
    actions.setHasPendingConfigChanges(true);
  }, [actions]);

  // Memoize return object to prevent unnecessary re-renders
  // Even though individual functions are memoized, object literal creates new reference
  return useMemo(() => ({
    handleCreateThread,
    handleUpdateThreadAndSend,
    handleResetForm,
    handleModeChange,
    isFormValid,
  }), [handleCreateThread, handleUpdateThreadAndSend, handleResetForm, handleModeChange, isFormValid]);
}
