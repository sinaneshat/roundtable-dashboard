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

import { AnalysisStatuses } from '@/api/core/enums';
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
    addAnalysis: s.addAnalysis,
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

      //   threadId: thread.id.slice(0, 8),
      //   messagesFromBackend: initialMessages.map(m => ({ role: m.role, metadata: m.metadata, roundNumber: m.roundNumber })),
      // });

      // ✅ SINGLE SOURCE OF TRUTH: Use date transform utilities
      const threadWithDates = transformChatThread(thread);
      const participantsWithDates = transformChatParticipants(participants);
      const messagesWithDates = transformChatMessages(initialMessages);

      //   messagesWithDates: messagesWithDates.map(m => ({ role: m.role, metadata: m.metadata })),
      // });

      actions.setShowInitialUI(false);
      actions.setCreatedThreadId(thread.id);

      // ✅ SINGLE SOURCE OF TRUTH: Use utility for type-safe message transformation
      // Replaces unsafe type assertions with validated conversion
      const uiMessages = chatMessagesToUIMessages(messagesWithDates);

      //   uiMessages: uiMessages.map(m => ({ role: m.role, metadata: m.metadata })),
      // });

      actions.initializeThread(threadWithDates, participantsWithDates, uiMessages);

      // ✅ EAGER RENDERING: Create placeholder analysis immediately for round 0
      // This allows the RoundAnalysisCard to render in PENDING state with loading UI
      // before participants finish streaming. Creates better UX with immediate visual feedback.
      actions.addAnalysis({
        id: `placeholder-analysis-${thread.id}-0`,
        threadId: thread.id,
        roundNumber: 0,
        mode: thread.mode,
        userQuestion: prompt,
        status: AnalysisStatuses.PENDING,
        analysisData: null,
        participantMessageIds: [],
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      // ✅ FIX: Clear input AFTER initializeThread so user message appears in UI first
      // User reported: "never empty out the chatbox until the request goes through
      // and the msg box of what user just said shows on the round"
      actions.setInputValue('');

      // ✅ CRITICAL FIX: Set pending message so provider can trigger participants
      // BUG FIX: Without this, pendingMessage stays null after pre-search completes
      // and participants never start streaming (provider effect exits immediately)
      //
      // This is the same pattern used by handleUpdateThreadAndSend in thread detail page
      // Now overview page will work correctly with web search enabled
      // ✅ BUG FIX: Use modelId instead of participant record id
      // Provider compares against modelIds, not participant record IDs
      const participantModelIds = participants.map(p => p.modelId);
      actions.prepareForNewMessage(prompt, participantModelIds);

      // ✅ EAGER RENDERING: Create placeholder pre-search immediately for round 0 when web search enabled
      // This allows the streaming trigger effect to see a pre-search exists
      // PreSearchStream component will execute the search when it renders and sees PENDING status
      //
      // NOTE: Backend also creates PENDING pre-search during thread creation, but:
      // - PreSearchOrchestrator only runs on thread screen, not overview screen
      // - Without this placeholder, streaming trigger effect returns early (no pre-search exists)
      // - PreSearchStream needs a pre-search record with userQuery to execute
      if (formState.enableWebSearch) {
        actions.addPreSearch({
          id: `placeholder-presearch-${thread.id}-0`,
          threadId: thread.id,
          roundNumber: 0,
          userQuery: prompt,
          status: AnalysisStatuses.PENDING,
          searchData: null,
          createdAt: new Date(),
          completedAt: null,
          errorMessage: null,
        });
      }

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

        // ✅ BUG FIX: Wait for PATCH completion when web search is enabled OR changes
        // Bug report: "enabling web search mid convo won't have a record made for it
        // and afterwards is not causing the initial searches to happen"
        //
        // ROOT CAUSE: Fire-and-forget pattern causes race condition
        // When web search is toggled but participants unchanged (no temp IDs):
        // 1. PATCH request fires (async, not awaited)
        // 2. Message immediately prepares and sends
        // 3. Streaming handler fetches thread (PATCH may not have completed)
        // 4. Thread still has old enableWebSearch value
        // 5. No pre-search record created → participants respond without search context
        //
        // ✅ EXTENDED FIX: Also wait when web search is CURRENTLY ENABLED (not just changed)
        // Even if web search didn't change between rounds, if participants/mode changed,
        // the fire-and-forget PATCH might not complete before streaming starts
        // This ensures thread.enableWebSearch is updated before streaming starts
        // Streaming handler will then correctly create pre-search record (streaming.handler.ts:141-160)
        //
        // Performance impact: Minimal (PATCH typically completes in <100ms)
        // Correctness impact: Critical (prevents broken web search functionality)
        const needsWait = updateResult.hasTemporaryIds || webSearchChanged || formState.enableWebSearch;
        if (needsWait) {
          // Wait for response when:
          // 1. Creating new participants (temporary IDs)
          // 2. Web search state changed
          // 3. Web search is currently enabled (prevents race condition on subsequent rounds)
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
      // On THREAD screen, this also adds optimistic user message to UI
      actions.prepareForNewMessage(trimmed, []);

      // ✅ FIX: Clear input AFTER prepareForNewMessage so user message appears in UI first
      // User reported: "never empty out the chatbox until the request goes through
      // and the msg box of what user just said shows on the round"
      // Also moved inside try block so input isn't cleared on error
      actions.setInputValue('');
    } catch (error) {
      showApiErrorToast('Error updating thread', error);
    }
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
