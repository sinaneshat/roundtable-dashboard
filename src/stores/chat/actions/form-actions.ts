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

import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';

// Removed: AnalysisStatuses import - no longer needed after removing duplicate pre-search creation
import { toCreateThreadRequest } from '@/components/chat/chat-form-schemas';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { useCreateThreadMutation, useUpdateThreadMutation } from '@/hooks/mutations/chat-mutations';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { showApiErrorToast } from '@/lib/toast';
import { transformChatMessages, transformChatParticipants, transformChatThread } from '@/lib/utils/date-transforms';
import { useMemoizedReturn } from '@/lib/utils/memo-utils';
import { chatMessagesToUIMessages } from '@/lib/utils/message-transforms';
import { prepareParticipantUpdate, shouldUpdateParticipantConfig } from '@/lib/utils/participant';

export type UseChatFormActionsReturn = {
  /** Submit form to create new thread */
  handleCreateThread: () => Promise<void>;
  /** Submit form to update existing thread and send message */
  handleUpdateThreadAndSend: (threadId: string) => Promise<void>;
  /** Reset form to initial state */
  handleResetForm: () => void;
  /** Change mode and mark as having pending changes */
  handleModeChange: (mode: ChatModeId) => void;
  /** Toggle web search on/off */
  handleWebSearchToggle: (enabled: boolean) => void;
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
    enableWebSearch: s.enableWebSearch,
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
    setEnableWebSearch: s.setEnableWebSearch,
    setShowInitialUI: s.setShowInitialUI,
    setIsCreatingThread: s.setIsCreatingThread,
    setWaitingToStartStreaming: s.setWaitingToStartStreaming,
    setCreatedThreadId: s.setCreatedThreadId,
    setHasPendingConfigChanges: s.setHasPendingConfigChanges,
    prepareForNewMessage: s.prepareForNewMessage,
    setExpectedParticipantIds: s.setExpectedParticipantIds,
    initializeThread: s.initializeThread,
    updateParticipants: s.updateParticipants,
    addPreSearch: s.addPreSearch,
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
        enableWebSearch: formState.enableWebSearch,
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

      // ✅ REMOVED: Duplicate pre-search creation
      // Backend already creates PENDING pre-search record during thread creation (thread.handler.ts:265-274)
      // PreSearchOrchestrator will sync it from server automatically
      // No need for temporary frontend record - causes race conditions with orchestrator sync

      // Set flag to trigger streaming once chat is ready
      // Store subscription will wait for startRound to be registered by provider
      actions.setWaitingToStartStreaming(true);
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
    formState.enableWebSearch,
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
      // ✅ EXTRACTED TO UTILITY: Detect participant changes
      const { updateResult, updatePayloads, optimisticParticipants } = prepareParticipantUpdate(
        threadState.participants,
        formState.selectedParticipants,
        threadId,
      );

      // Check for non-participant changes
      const currentModeId = threadState.thread?.mode || null;
      const currentWebSearch = threadState.thread?.enableWebSearch || false;
      const modeChanged = currentModeId !== formState.selectedMode;
      const webSearchChanged = currentWebSearch !== formState.enableWebSearch;

      // Determine if any changes require API update
      const hasAnyChanges = shouldUpdateParticipantConfig(updateResult) || modeChanged || webSearchChanged;

      // ✅ CRITICAL FIX: Only make PATCH request if something actually changed
      if (hasAnyChanges) {
        // Save current state for rollback on failure
        const previousParticipants = threadState.participants;

        // Update participants optimistically
        actions.updateParticipants(optimisticParticipants);

        if (updateResult.hasTemporaryIds) {
          // Wait for response when creating new participants
          const response = await updateThreadMutation.mutateAsync({
            param: { id: threadId },
            json: {
              participants: updatePayloads,
              mode: formState.selectedMode,
              enableWebSearch: formState.enableWebSearch,
            },
          });

          if (response?.data?.participants) {
            // ✅ SINGLE SOURCE OF TRUTH: Use date transform utility
            const participantsWithDates = transformChatParticipants(response.data.participants);

            actions.updateParticipants(participantsWithDates);
            actions.setExpectedParticipantIds(participantsWithDates.map(p => p.modelId));
          } else {
            actions.setExpectedParticipantIds(optimisticParticipants.map(p => p.modelId));
          }
        } else {
          // ✅ CRITICAL FIX: Rollback optimistic update on failure
          // Fire-and-forget with rollback - optimistic update already applied
          updateThreadMutation.mutateAsync({
            param: { id: threadId },
            json: {
              participants: updatePayloads,
              mode: formState.selectedMode,
              enableWebSearch: formState.enableWebSearch,
            },
          }).catch((error) => {
            // Rollback optimistic update on failure
            actions.updateParticipants(previousParticipants);
            showApiErrorToast('Failed to save configuration changes', error);
          });

          actions.setExpectedParticipantIds(optimisticParticipants.map(p => p.modelId));
        }
      } else {
        // No changes - just use current participants for expected IDs
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

  /**
   * Toggle web search on/off
   * Used by ChatOverviewScreen
   */
  const handleWebSearchToggle = useCallback((enabled: boolean) => {
    actions.setEnableWebSearch(enabled);
  }, [actions]);

  // Memoize return object to prevent unnecessary re-renders
  return useMemoizedReturn({
    handleCreateThread,
    handleUpdateThreadAndSend,
    handleResetForm,
    handleModeChange,
    handleWebSearchToggle,
    isFormValid,
  }, [handleCreateThread, handleUpdateThreadAndSend, handleResetForm, handleModeChange, handleWebSearchToggle, isFormValid]);
}
