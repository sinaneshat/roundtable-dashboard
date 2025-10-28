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

import type { UIMessage } from 'ai';
import { useCallback, useMemo } from 'react';

import { toCreateThreadRequest } from '@/components/chat/chat-form-schemas';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { useCreateThreadMutation, useUpdateThreadMutation } from '@/hooks/mutations/chat-mutations';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { showApiErrorToast } from '@/lib/toast';

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
  // Store selectors
  const inputValue = useChatStore(s => s.inputValue);
  const selectedMode = useChatStore(s => s.selectedMode);
  const selectedParticipants = useChatStore(s => s.selectedParticipants);
  const initializeThread = useChatStore(s => s.initializeThread);
  const updateParticipants = useChatStore(s => s.updateParticipants);

  // Store actions
  const setInputValue = useChatStore(s => s.setInputValue);
  const resetForm = useChatStore(s => s.resetForm);
  const setSelectedMode = useChatStore(s => s.setSelectedMode);
  const setShowInitialUI = useChatStore(s => s.setShowInitialUI);
  const setIsCreatingThread = useChatStore(s => s.setIsCreatingThread);
  const setWaitingToStartStreaming = useChatStore(s => s.setWaitingToStartStreaming);
  const setCreatedThreadId = useChatStore(s => s.setCreatedThreadId);
  const setHasPendingConfigChanges = useChatStore(s => s.setHasPendingConfigChanges);
  const prepareForNewMessage = useChatStore(s => s.prepareForNewMessage);
  const setExpectedParticipantIds = useChatStore(s => s.setExpectedParticipantIds);

  // Mutations
  const createThreadMutation = useCreateThreadMutation();
  const updateThreadMutation = useUpdateThreadMutation();

  // Form validation
  const isFormValid = Boolean(
    inputValue.trim()
    && selectedParticipants.length > 0
    && selectedMode,
  );

  /**
   * Create a new thread with current form state
   * Used by ChatOverviewScreen
   */
  const handleCreateThread = useCallback(async () => {
    const prompt = inputValue.trim();

    if (!prompt || selectedParticipants.length === 0 || !selectedMode) {
      return;
    }

    try {
      setIsCreatingThread(true);

      const createThreadRequest = toCreateThreadRequest({
        message: prompt,
        mode: selectedMode,
        participants: selectedParticipants,
      });

      const response = await createThreadMutation.mutateAsync({
        json: createThreadRequest,
      });

      const { thread, participants, messages: initialMessages } = response.data;

      // Backend provides clean, deduplicated data
      const threadWithDates = {
        ...thread,
        createdAt: new Date(thread.createdAt),
        updatedAt: new Date(thread.updatedAt),
        lastMessageAt: thread.lastMessageAt ? new Date(thread.lastMessageAt) : null,
      };

      const participantsWithDates = participants.map(p => ({
        ...p,
        createdAt: new Date(p.createdAt),
        updatedAt: new Date(p.updatedAt),
      }));

      // Convert initial messages to UI messages with dates
      const messagesWithDates = initialMessages.map(m => ({
        ...m,
        createdAt: new Date(m.createdAt),
      }));

      setShowInitialUI(false);
      setInputValue('');
      setCreatedThreadId(thread.id);

      // AI SDK v5 Pattern: Initialize thread WITH backend messages
      // Type assertion needed: Backend message parts match AI SDK UIMessage structure
      // Both use { type: 'text', text: string } format
      const uiMessages = messagesWithDates.map((m): UIMessage => ({
        id: m.id,
        role: m.role as UIMessage['role'],
        parts: m.parts as UIMessage['parts'],
        metadata: m.metadata,
      }));

      initializeThread(threadWithDates, participantsWithDates, uiMessages);

      // Set flag to trigger streaming once chat is ready
      // Use queueMicrotask to ensure store updates have propagated
      queueMicrotask(() => {
        setWaitingToStartStreaming(true);
      });
    } catch (error) {
      showApiErrorToast('Error creating thread', error);
      setShowInitialUI(true);
    } finally {
      setIsCreatingThread(false);
    }
  }, [
    inputValue,
    selectedMode,
    selectedParticipants,
    createThreadMutation,
    initializeThread,
    setShowInitialUI,
    setInputValue,
    setCreatedThreadId,
    setIsCreatingThread,
    setWaitingToStartStreaming,
  ]);

  /**
   * Update existing thread and send message
   * Used by ChatThreadScreen
   */
  const handleUpdateThreadAndSend = useCallback(async (threadId: string) => {
    const trimmed = inputValue.trim();

    if (!trimmed || selectedParticipants.length === 0 || !selectedMode) {
      return;
    }

    try {
      // Prepare participants for update
      const participantsForUpdate = selectedParticipants.map(p => ({
        id: p.id.startsWith('participant-') ? '' : p.id,
        modelId: p.modelId,
        role: p.role || null,
        customRoleId: p.customRoleId || null,
        priority: p.priority,
        isEnabled: true,
      }));

      const optimisticParticipants = selectedParticipants.map((p, index) => ({
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

      const hasTemporaryIds = selectedParticipants.some(p => p.id.startsWith('participant-'));

      // Update participants optimistically
      updateParticipants(optimisticParticipants);

      if (hasTemporaryIds) {
        const response = await updateThreadMutation.mutateAsync({
          param: { id: threadId },
          json: {
            participants: participantsForUpdate,
            mode: selectedMode,
          },
        });

        if (response?.data?.participants) {
          const participantsWithDates = response.data.participants.map(p => ({
            ...p,
            createdAt: new Date(p.createdAt),
            updatedAt: new Date(p.updatedAt),
          }));

          updateParticipants(participantsWithDates);
          await new Promise(resolve => queueMicrotask(resolve));
          setExpectedParticipantIds(participantsWithDates.map(p => p.modelId));
        } else {
          setExpectedParticipantIds(optimisticParticipants.map(p => p.modelId));
        }
      } else {
        updateThreadMutation.mutateAsync({
          param: { id: threadId },
          json: {
            participants: participantsForUpdate,
            mode: selectedMode,
          },
        }).catch(() => {
          // Silently fail - optimistic update already applied
        });

        await new Promise(resolve => queueMicrotask(resolve));
        setExpectedParticipantIds(optimisticParticipants.map(p => p.modelId));
      }

      // Prepare for new message (sets flags and pending message)
      prepareForNewMessage(trimmed, []);
    } catch (error) {
      showApiErrorToast('Error updating thread', error);
    }

    setInputValue('');
  }, [
    inputValue,
    selectedMode,
    selectedParticipants,
    updateThreadMutation,
    updateParticipants,
    prepareForNewMessage,
    setInputValue,
    setExpectedParticipantIds,
  ]);

  /**
   * Reset form to initial state
   */
  const handleResetForm = useCallback(() => {
    resetForm();
  }, [resetForm]);

  /**
   * Change mode and mark as having pending changes
   * Used by ChatThreadScreen
   */
  const handleModeChange = useCallback((mode: ChatModeId) => {
    setSelectedMode(mode);
    setHasPendingConfigChanges(true);
  }, [setSelectedMode, setHasPendingConfigChanges]);

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
