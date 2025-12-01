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

import { MessagePartTypes, MessageRoles } from '@/api/core/enums';
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

import { createPlaceholderAnalysis, createPlaceholderPreSearch } from '../utils/placeholder-factories';

/**
 * Attachment info for building optimistic file parts
 * Passed from useChatAttachments hook to form actions
 */
export type AttachmentInfo = {
  uploadId: string;
  filename: string;
  mimeType: string;
  previewUrl?: string;
};

export type UseChatFormActionsReturn = {
  /** Submit form to create new thread (with optional attachment IDs and metadata) */
  handleCreateThread: (attachmentIds?: string[], attachmentInfos?: AttachmentInfo[]) => Promise<void>;
  /** Submit form to update existing thread and send message (with optional attachment IDs and metadata) */
  handleUpdateThreadAndSend: (threadId: string, attachmentIds?: string[], attachmentInfos?: AttachmentInfo[]) => Promise<void>;
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
    pendingAttachments: s.pendingAttachments, // ✅ For optimistic message file parts
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
    // ✅ ATTACHMENT CLEARING: Clear attachments after thread/message is created
    clearAttachments: s.clearAttachments,
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
   * @param attachmentIds - Optional upload IDs to attach to the first message
   * @param _attachmentInfos - Optional attachment metadata (unused - server provides file parts in response)
   */
  const handleCreateThread = useCallback(async (attachmentIds?: string[], _attachmentInfos?: AttachmentInfo[]) => {
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
      }, attachmentIds);

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
      actions.addAnalysis(createPlaceholderAnalysis({
        threadId: thread.id,
        roundNumber: 0,
        mode: thread.mode,
        userQuestion: prompt,
      }));

      // ✅ FIX: Clear input AFTER initializeThread so user message appears in UI first
      // User reported: "never empty out the chatbox until the request goes through
      // and the msg box of what user just said shows on the round"
      actions.setInputValue('');

      // ✅ FIX: Clear attachments AFTER thread is created and message is in store
      // This keeps attachment previews visible until the user message shows in the thread
      actions.clearAttachments();

      // ✅ TIMING FIX: Add placeholder pre-search BEFORE prepareForNewMessage
      // This ensures the pre-search exists in the SAME render cycle as the pending message state,
      // preventing timing issues where UI renders without pre-search data
      if (formState.enableWebSearch) {
        actions.addPreSearch(createPlaceholderPreSearch({
          threadId: thread.id,
          roundNumber: 0,
          userQuery: prompt,
        }));
      }

      // ✅ CRITICAL FIX: Set pending message so provider can trigger participants
      // BUG FIX: Without this, pendingMessage stays null after pre-search completes
      // and participants never start streaming (provider effect exits immediately)
      //
      // This is the same pattern used by handleUpdateThreadAndSend in thread detail page
      // Now overview page will work correctly with web search enabled
      // ✅ BUG FIX: Use modelId instead of participant record id
      // Provider compares against modelIds, not participant record IDs
      const participantModelIds = participants.map(p => p.modelId);
      actions.prepareForNewMessage(prompt, participantModelIds, attachmentIds);

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
   * @param threadId - The thread ID to update
   * @param attachmentIds - Optional upload IDs to attach to the message
   * @param attachmentInfos - Optional attachment metadata for building optimistic file parts
   */
  const handleUpdateThreadAndSend = useCallback(async (threadId: string, attachmentIds?: string[], attachmentInfos?: AttachmentInfo[]) => {
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

      // ✅ TIMING FIX: Add placeholder pre-search BEFORE user message
      // This ensures the pre-search accordion appears in the SAME render cycle as the user message,
      // preventing the "late accordion" issue where user message renders first without pre-search,
      // then pre-search appears in a subsequent render causing layout shift and placeholder duplications
      if (formState.enableWebSearch) {
        actions.addPreSearch(createPlaceholderPreSearch({
          threadId,
          roundNumber: nextRoundNumber,
          userQuery: trimmed,
        }));
      }

      // Add optimistic user message IMMEDIATELY for instant UI feedback
      // ✅ FIX: Include file parts so attachments show in optimistic message
      // Use attachmentInfos passed from useChatAttachments hook (single source of truth)
      const fileParts = attachmentInfos && attachmentInfos.length > 0
        ? attachmentInfos.map(att => ({
            type: 'file' as const,
            // Use preview URL for optimistic display, backend will provide final URL
            url: att.previewUrl || '',
            filename: att.filename,
            mediaType: att.mimeType,
          }))
        : [];

      const optimisticUserMessage: UIMessage = {
        id: `optimistic-user-${Date.now()}`,
        role: MessageRoles.USER,
        parts: [
          ...fileParts, // Files first (matches UI layout)
          { type: MessagePartTypes.TEXT, text: trimmed },
        ],
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

      // Prepare for new message (sets flags, pending message, and attachment IDs)
      // On THREAD screen, this also adds optimistic user message to UI
      actions.prepareForNewMessage(trimmed, [], attachmentIds);

      // ✅ FIX: Clear input AFTER prepareForNewMessage so user message appears in UI first
      // User reported: "never empty out the chatbox until the request goes through
      // and the msg box of what user just said shows on the round"
      // Also moved inside try block so input isn't cleared on error
      actions.setInputValue('');

      // ✅ FIX: Clear attachments AFTER optimistic message is added to store
      // This keeps attachment previews visible until the user message shows in the thread
      actions.clearAttachments();
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
