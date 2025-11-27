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
import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { AnalysisStatuses, MessagePartTypes, MessageRoles } from '@/api/core/enums';
import { toCreateThreadRequest } from '@/components/chat/chat-form-schemas';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { useCreateThreadMutation, useUpdateThreadMutation } from '@/hooks/mutations/chat-mutations';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { showApiErrorToast } from '@/lib/toast';
import { transformChatMessages, transformChatParticipants, transformChatThread } from '@/lib/utils/date-transforms';
import { useMemoizedReturn } from '@/lib/utils/memo-utils';
import { chatMessagesToUIMessages } from '@/lib/utils/message-transforms';
import { getRoundNumber } from '@/lib/utils/metadata';
import { chatParticipantsToConfig, prepareParticipantUpdate, shouldUpdateParticipantConfig } from '@/lib/utils/participant';
import { calculateNextRoundNumber } from '@/lib/utils/round-utils';

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
    messages: s.messages, // ✅ IMMEDIATE UI FEEDBACK: For calculating next round
  })));

  // Batch actions selectors (functions are stable, but batching reduces subscriptions)
  const actions = useChatStore(useShallow(s => ({
    setInputValue: s.setInputValue,
    resetForm: s.resetForm,
    setSelectedMode: s.setSelectedMode,
    setSelectedParticipants: s.setSelectedParticipants,
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
    // ✅ IMMEDIATE UI FEEDBACK: For eager accordion collapse and optimistic message
    setStreamingRoundNumber: s.setStreamingRoundNumber,
    setMessages: s.setMessages,
    setHasEarlyOptimisticMessage: s.setHasEarlyOptimisticMessage,
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

      // ✅ CRITICAL FIX: Sync selectedParticipants with DB IDs immediately after thread creation
      // BUG FIX: Without this, selectedParticipants keeps frontend IDs (participant-XXX) from overview screen
      // When user sends next message, prepareParticipantUpdate sees frontend IDs as "new" participants
      // and creates duplicate participants in database (empty ID = create new)
      const syncedParticipantConfigs = chatParticipantsToConfig(participantsWithDates);
      actions.setSelectedParticipants(syncedParticipantConfigs);

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

      // ✅ IMMEDIATE UI FEEDBACK: Set streamingRoundNumber IMMEDIATELY for round 0
      // This enables ChatMessageList to show pending participant cards with shimmer animation
      // BUG FIX: Previously only handleUpdateThreadAndSend set this, leaving overview screen
      // without streamingRoundNumber, which caused isLatestRound check to fail
      // and pending participant cards to not render during initial round
      actions.setStreamingRoundNumber(0);

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
      // ============================================================================
      // ✅ IMMEDIATE UI FEEDBACK: Set streamingRoundNumber and optimistic message FIRST
      // ============================================================================
      // CRITICAL FIX: This enables immediate accordion collapse and message display
      // BEFORE any API calls (PATCH) that might take 100-500ms
      //
      // Previous bug: prepareForNewMessage was called AFTER awaiting PATCH, causing:
      // 1. Accordion stays open during PATCH wait
      // 2. User message doesn't appear until PATCH completes
      // 3. Changelog doesn't appear until PATCH completes
      //
      // Fix: Set streamingRoundNumber + add optimistic message immediately
      // Then prepareForNewMessage will merge with this state later
      // ============================================================================
      let calculatedNextRound = calculateNextRoundNumber(threadState.messages);

      // ✅ CRITICAL: Defensive validation to prevent round override bug
      // BUG FIX: When navigating from overview to thread, store messages might be stale
      // If calculatedNextRound is 0 but we already have messages, something is wrong
      // This prevents accidentally overwriting a completed round
      if (calculatedNextRound === 0 && threadState.messages.length > 0) {
        // Check if round 0 already has assistant messages (round completed)
        // ✅ TYPE-SAFE: Use getRoundNumber utility for Zod-validated metadata extraction
        const round0AssistantMessages = threadState.messages.filter(
          m =>
            m.role === MessageRoles.ASSISTANT
            && getRoundNumber(m.metadata) === 0,
        );
        if (round0AssistantMessages.length > 0) {
          console.error('[handleUpdateThreadAndSend] Round override detected!', {
            calculatedRound: calculatedNextRound,
            totalMessages: threadState.messages.length,
            round0AssistantCount: round0AssistantMessages.length,
            // ✅ TYPE-SAFE: Use getRoundNumber for metadata extraction in diagnostic log
            messageRoundNumbers: threadState.messages.map(m => ({
              role: m.role,
              roundNumber: getRoundNumber(m.metadata),
            })),
          });
          // Force recalculate using fallback: count user messages
          const userMessages = threadState.messages.filter(m => m.role === MessageRoles.USER);
          calculatedNextRound = userMessages.length;
          console.error('[handleUpdateThreadAndSend] Correcting to round', calculatedNextRound);
        }
      }

      // Use the (potentially corrected) round number
      const nextRoundNumber = calculatedNextRound;

      // Set streamingRoundNumber IMMEDIATELY for accordion collapse
      actions.setStreamingRoundNumber(nextRoundNumber);

      // Add optimistic user message IMMEDIATELY for instant UI feedback
      const optimisticUserMessage: UIMessage = {
        id: `optimistic-user-${Date.now()}`,
        role: MessageRoles.USER,
        parts: [{ type: MessagePartTypes.TEXT, text: trimmed }],
        metadata: {
          role: MessageRoles.USER,
          roundNumber: nextRoundNumber,
          isOptimistic: true, // Marker for optimistic update
        },
      };
      actions.setMessages([...threadState.messages, optimisticUserMessage]);

      // ✅ IMMEDIATE UI FEEDBACK: Set flag to tell prepareForNewMessage not to add duplicate
      // This flag is cleared by prepareForNewMessage after it checks it
      actions.setHasEarlyOptimisticMessage(true);

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

            // ✅ CRITICAL FIX: Sync selectedParticipants with DB IDs after successful update
            // BUG FIX: Without this, selectedParticipants keeps frontend IDs (participant-XXX)
            // When user sends next message, prepareParticipantUpdate sees frontend IDs as "new" participants
            // and creates duplicate participants in database (empty ID = create new)
            const syncedParticipantConfigs = chatParticipantsToConfig(participantsWithDates);
            actions.setSelectedParticipants(syncedParticipantConfigs);

            // ✅ Reset hasPendingConfigChanges since changes are now saved
            actions.setHasPendingConfigChanges(false);
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
          }).then((response) => {
            // On success, sync selectedParticipants with DB IDs and reset hasPendingConfigChanges
            if (response?.data?.participants) {
              const participantsWithDates = transformChatParticipants(response.data.participants);
              actions.updateParticipants(participantsWithDates);
              const syncedParticipantConfigs = chatParticipantsToConfig(participantsWithDates);
              actions.setSelectedParticipants(syncedParticipantConfigs);
            }
            actions.setHasPendingConfigChanges(false);
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

      // ✅ EAGER RENDERING: Create placeholder pre-search immediately for round 2+ when web search enabled
      // This matches the pattern in handleCreateThread (overview screen) for round 0
      // Without this placeholder:
      // - Web search accordion doesn't appear with loading/shimmer state
      // - Participant placeholders don't show "waiting for web search"
      // - UI appears broken because pre-search is created asynchronously by provider effect
      //
      // The provider will later execute the actual pre-search, but the placeholder ensures
      // immediate visual feedback while waiting for the backend to create/execute the search
      if (formState.enableWebSearch) {
        // ✅ IMMEDIATE UI FEEDBACK: Reuse nextRoundNumber calculated at start of function
        actions.addPreSearch({
          id: `placeholder-presearch-${threadId}-${nextRoundNumber}`,
          threadId,
          roundNumber: nextRoundNumber,
          userQuery: trimmed,
          status: AnalysisStatuses.PENDING,
          searchData: null,
          createdAt: new Date(),
          completedAt: null,
          errorMessage: null,
        });
      }

      // ✅ FIX: Clear input AFTER prepareForNewMessage so user message appears in UI first
      // User reported: "never empty out the chatbox until the request goes through
      // and the msg box of what user just said shows on the round"
      // Also moved inside try block so input isn't cleared on error
      actions.setInputValue('');
    } catch (error) {
      // ✅ CRITICAL FIX: Clean up state on error to prevent UI freeze
      // If we get here, we've already set:
      // - streamingRoundNumber (causes accordion to collapse)
      // - messages with optimistic user message
      // - hasEarlyOptimisticMessage = true (blocks message sync)
      // We must revert these to restore a usable UI state

      // Clear the optimistic message flag so message sync can resume
      actions.setHasEarlyOptimisticMessage(false);

      // Reset streaming round number since we're not actually streaming
      actions.setStreamingRoundNumber(null);

      // Remove the optimistic user message we added
      // Filter out messages with isOptimistic: true in metadata
      const currentMessages = threadState.messages;
      const originalMessages = currentMessages.filter((m) => {
        const metadata = m.metadata;
        return !(metadata && typeof metadata === 'object' && 'isOptimistic' in metadata && metadata.isOptimistic === true);
      });
      actions.setMessages(originalMessages);

      // DON'T clear input value on error - let user retry with same message

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
