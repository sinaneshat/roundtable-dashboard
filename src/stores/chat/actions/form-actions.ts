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

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { ChatMode } from '@/api/core/enums';
import { MessageRoles } from '@/api/core/enums';
import { getModelCapabilities } from '@/api/services/model-capabilities.service';
import { toCreateThreadRequest } from '@/components/chat/chat-form-schemas';
import { useChatStore } from '@/components/providers';
import {
  useCreateThreadMutation,
  useUpdateThreadMutation,
} from '@/hooks/mutations';
import { queryKeys } from '@/lib/data/query-keys';
import type { ExtendedFilePart } from '@/lib/schemas/message-schemas';
import { showApiErrorToast, showApiWarningToast } from '@/lib/toast';
import { calculateNextRoundNumber, chatMessagesToUIMessages, chatParticipantsToConfig, devLog, getParticipantModelIds, getRoundNumber, isVisionRequiredMimeType, prepareParticipantUpdate, shouldUpdateParticipantConfig, transformChatMessages, transformChatParticipants, transformChatThread, useMemoizedReturn } from '@/lib/utils';

import { createOptimisticUserMessage, createPlaceholderPreSearch } from '../utils/placeholder-factories';
import { validateInfiniteQueryCache } from './types';

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
  handleModeChange: (mode: ChatMode) => void;
  /** Toggle web search on/off */
  handleWebSearchToggle: (enabled: boolean) => void;
  /** Check if form is valid for submission */
  isFormValid: boolean;
  /** Whether a submission is currently in progress (API call pending) */
  isSubmitting: boolean;
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
  const queryClient = useQueryClient();

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
    // ✅ IMMEDIATE UI FEEDBACK: For eager accordion collapse and optimistic message
    setStreamingRoundNumber: s.setStreamingRoundNumber,
    // ✅ THREAD SCREEN RESUMPTION: Required for continueFromParticipant effect
    setNextParticipantToTrigger: s.setNextParticipantToTrigger,
    setMessages: s.setMessages,
    setHasEarlyOptimisticMessage: s.setHasEarlyOptimisticMessage,
    // ✅ ATTACHMENT CLEARING: Clear attachments after thread/message is created
    clearAttachments: s.clearAttachments,
    // ✅ THREAD STATE SYNC: Sync thread state (enableWebSearch, mode) after update
    setThread: s.setThread,
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
  const handleCreateThread = useCallback(async (attachmentIds?: string[], attachmentInfos?: AttachmentInfo[]) => {
    const prompt = formState.inputValue.trim();

    if (!prompt || formState.selectedParticipants.length === 0 || !formState.selectedMode) {
      return;
    }

    // ============================================================================
    // ✅ MODEL CAPABILITY VALIDATION: Check vision support for image/PDF attachments
    // ============================================================================
    const hasVisionFiles = attachmentInfos?.some(
      info => isVisionRequiredMimeType(info.mimeType),
    ) ?? false;

    if (hasVisionFiles) {
      const nonVisionModels = formState.selectedParticipants.filter((participant) => {
        const capabilities = getModelCapabilities(participant.modelId);
        return !capabilities.vision;
      });

      if (nonVisionModels.length > 0) {
        const modelNames = nonVisionModels.map(p => p.modelId.split('/').pop()).join(', ');
        showApiWarningToast(
          'Model incompatibility',
          `${modelNames} cannot process images/PDFs. Select vision-capable models or remove image attachments.`,
        );
        return;
      }
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

      // ✅ SINGLE SOURCE OF TRUTH: Use date transform utilities
      const threadWithDates = transformChatThread(thread);
      const participantsWithDates = transformChatParticipants(participants);
      const messagesWithDates = transformChatMessages(initialMessages);

      actions.setShowInitialUI(false);
      actions.setCreatedThreadId(thread.id);

      // ✅ SINGLE SOURCE OF TRUTH: Use utility for type-safe message transformation
      // Replaces unsafe type assertions with validated conversion
      const uiMessages = chatMessagesToUIMessages(messagesWithDates);

      actions.initializeThread(threadWithDates, participantsWithDates, uiMessages);

      // Sync selectedParticipants with DB IDs immediately after thread creation.
      // Without this, selectedParticipants keeps frontend IDs (participant-XXX) from overview screen.
      // When user sends next message, prepareParticipantUpdate sees frontend IDs as "new" participants
      // and creates duplicate participants in database (empty ID = create new).
      const syncedParticipantConfigs = chatParticipantsToConfig(participantsWithDates);
      actions.setSelectedParticipants(syncedParticipantConfigs);

      // ✅ IMMEDIATE SIDEBAR UPDATE: Add new thread to sidebar cache optimistically
      // This ensures the sidebar shows the new thread immediately after creation,
      // even before the AI-generated title is ready (which happens async via waitUntil)
      queryClient.setQueriesData(
        {
          queryKey: queryKeys.threads.all,
          predicate: (query) => {
            // Only update infinite queries (thread lists)
            return query.queryKey.length >= 2 && query.queryKey[1] === 'list';
          },
        },
        (old: unknown) => {
          const parsedQuery = validateInfiniteQueryCache(old);
          if (!parsedQuery)
            return old;

          // Create thread item for cache (matches list item structure)
          const threadItem = {
            id: thread.id,
            title: thread.title,
            slug: thread.slug,
            mode: thread.mode,
            status: thread.status,
            isFavorite: thread.isFavorite,
            isPublic: thread.isPublic,
            isAiGeneratedTitle: thread.isAiGeneratedTitle,
            enableWebSearch: thread.enableWebSearch,
            createdAt: thread.createdAt,
            updatedAt: thread.updatedAt,
            lastMessageAt: thread.lastMessageAt,
          };

          // Prepend thread to first page (most recent first)
          return {
            ...parsedQuery,
            pages: parsedQuery.pages.map((page, index) => {
              if (index !== 0 || !page.success || !page.data?.items)
                return page;

              return {
                ...page,
                data: {
                  ...page.data,
                  items: [threadItem, ...page.data.items],
                },
              };
            }),
          };
        },
      );

      // ✅ IMMEDIATE URL REPLACEMENT: Replace URL with initial slug immediately
      // This updates the browser URL before AI title generation completes
      // When AI title is ready, flow-controller will replace with AI-generated slug
      queueMicrotask(() => {
        window.history.replaceState(
          window.history.state,
          '',
          `/chat/${thread.slug}`,
        );
      });

      // ✅ TEXT STREAMING: Moderators are now streamed as moderator messages via RoundModeratorStream
      // No placeholder needed - the component directly triggers POST /api/v1/chat/moderator

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
      actions.prepareForNewMessage(prompt, getParticipantModelIds(participants), attachmentIds);

      // ✅ IMMEDIATE UI FEEDBACK: Set streamingRoundNumber IMMEDIATELY for round 0
      // This enables ChatMessageList to show pending participant cards with shimmer animation
      // BUG FIX: Previously only handleUpdateThreadAndSend set this, leaving overview screen
      // without streamingRoundNumber, which caused isLatestRound check to fail
      // and pending participant cards to not render during initial round
      actions.setStreamingRoundNumber(0);

      // Set flag to trigger streaming once chat is ready
      // Store subscription will wait for startRound to be registered by provider
      actions.setWaitingToStartStreaming(true);

      // ✅ THREAD SCREEN RESUMPTION FIX: Set nextParticipantToTrigger for thread screen
      // BUG: When user creates thread on overview and navigates to thread screen before
      // streaming starts, the overview effect returns early (not on overview screen) and
      // continueFromParticipant effect requires nextParticipantToTrigger to be set.
      // Without this, streaming never starts - system enters deadlock.
      actions.setNextParticipantToTrigger(0);
    } catch (error) {
      console.error('[handleCreateThread] Error creating thread:', error);
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
    queryClient,
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

    // ============================================================================
    // ✅ MODEL CAPABILITY VALIDATION: Check vision support for image/PDF attachments
    // ============================================================================
    // Check if any messages (including new attachments) have vision-required files
    // and validate that ALL selected participants support vision.
    // This prevents "No endpoints found that support image input" errors from OpenRouter.

    // Collect MIME types from:
    // 1. Existing messages (file parts from previous rounds)
    // 2. New attachments being added this round
    const existingVisionFiles = threadState.messages.some((msg) => {
      if (!msg.parts)
        return false;
      return msg.parts.some((part) => {
        if (part.type !== 'file' || !('mediaType' in part))
          return false;
        return isVisionRequiredMimeType(part.mediaType as string);
      });
    });

    const newVisionFiles = attachmentInfos?.some(
      info => isVisionRequiredMimeType(info.mimeType),
    ) ?? false;

    const hasVisionFiles = existingVisionFiles || newVisionFiles;

    if (hasVisionFiles) {
      // Check if all selected participants support vision
      const nonVisionModels = formState.selectedParticipants.filter((participant) => {
        const capabilities = getModelCapabilities(participant.modelId);
        return !capabilities.vision;
      });

      if (nonVisionModels.length > 0) {
        const modelNames = nonVisionModels.map(p => p.modelId.split('/').pop()).join(', ');
        showApiWarningToast(
          'Model incompatibility',
          `${modelNames} cannot process images/PDFs. Select vision-capable models or remove image attachments.`,
        );
        return;
      }
    }

    // ✅ Calculate round number BEFORE try block so it's accessible in catch for cleanup
    let pendingRoundNumber = calculateNextRoundNumber(threadState.messages);
    // Defensive validation
    if (pendingRoundNumber === 0 && threadState.messages.length > 0) {
      const round0AssistantMessages = threadState.messages.filter(
        m => m.role === MessageRoles.ASSISTANT && getRoundNumber(m.metadata) === 0,
      );
      if (round0AssistantMessages.length > 0) {
        const userMessages = threadState.messages.filter(m => m.role === MessageRoles.USER);
        pendingRoundNumber = userMessages.length;
      }
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
      // Use the already calculated and validated round number
      const nextRoundNumber = pendingRoundNumber;

      // Debug: Track new round initiation (debounced)
      devLog.d('NewRound', { rnd: nextRoundNumber, msgs: threadState.messages.length, parts: formState.selectedParticipants.length });

      // Set streamingRoundNumber IMMEDIATELY for accordion collapse
      actions.setStreamingRoundNumber(nextRoundNumber);

      // ✅ TIMING FIX: Add placeholder pre-search BEFORE user message
      // This ensures the pre-search accordion appears in the SAME render cycle as the user message,
      // preventing the "late accordion" issue where user message renders first without pre-search,
      // then pre-search appears in a subsequent render causing layout shift and placeholder duplications
      // ✅ BUG FIX: Use formState.enableWebSearch directly (user's current intent)
      // Previously used getEffectiveWebSearchEnabled which returned thread.enableWebSearch
      // But thread hasn't been updated via PATCH yet, causing web search to run when disabled
      // User's form state IS the source of truth for THIS message submission
      if (formState.enableWebSearch) {
        actions.addPreSearch(createPlaceholderPreSearch({
          threadId,
          roundNumber: nextRoundNumber,
          userQuery: trimmed,
        }));
      }

      // Add optimistic user message IMMEDIATELY for instant UI feedback
      // ✅ Uses ExtendedFilePart from message-schemas.ts (single source of truth)
      // - Use attachmentInfos passed from useChatAttachments hook
      // - Include uploadId so preview component can fetch signed URL for invalid blob/empty URLs
      const fileParts: ExtendedFilePart[] = attachmentInfos && attachmentInfos.length > 0
        ? attachmentInfos.map(att => ({
            type: 'file' as const,
            url: att.previewUrl || '',
            filename: att.filename,
            mediaType: att.mimeType,
            uploadId: att.uploadId,
          }))
        : [];

      const optimisticUserMessage = createOptimisticUserMessage({
        roundNumber: nextRoundNumber,
        text: trimmed,
        fileParts,
      });
      // ✅ FIX: Use function updater to get CURRENT messages from store
      // BUG FIX: threadState.messages is captured at function start and could be stale
      // This caused round 1 to overwrite round 0's assistant messages when they weren't synced yet
      // ✅ MODERATOR PLACEHOLDER: Added in use-pending-message.ts before sending (like use-streaming-trigger for Round 0)
      // This avoids race conditions with concurrent moderator streaming updates
      actions.setMessages(currentMessages => [...currentMessages, optimisticUserMessage]);

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

        // ✅ BUG FIX: Wait for PATCH completion when config changes affect streaming
        // ROOT CAUSE: Fire-and-forget pattern causes race condition
        // When PATCH runs async, streaming handler may read stale DB state
        //
        // ✅ DUPLICATE CHANGELOG FIX: Also wait when mode changes
        // Without this, both PATCH and streaming handler log mode change:
        // 1. PATCH fires async (not awaited)
        // 2. Streaming handler starts, reads old thread.mode
        // 3. Streaming handler logs changelog (old → new)
        // 4. PATCH completes and also logs changelog (old → new)
        // Result: 2 duplicate changelog entries
        //
        // Performance impact: Minimal (PATCH typically completes in <100ms)
        // Correctness impact: Critical (prevents duplicate changelogs)
        // ✅ BUG FIX: Use formState.enableWebSearch (user's intent) instead of stale thread state
        // Previously used effectiveWebSearch which read from thread state before PATCH updated it
        const needsWait = updateResult.hasTemporaryIds || webSearchChanged || modeChanged || formState.enableWebSearch;
        if (needsWait) {
          // Wait for response when:
          // 1. Creating new participants (temporary IDs)
          // 2. Web search state changed
          // 3. Mode changed (prevents duplicate changelog entries)
          // 4. Web search is currently enabled (prevents race condition on subsequent rounds)
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
            actions.setExpectedParticipantIds(getParticipantModelIds(participantsWithDates));

            // Sync selectedParticipants with DB IDs after successful update.
            // Without this, selectedParticipants keeps frontend IDs (participant-XXX).
            // When user sends next message, prepareParticipantUpdate sees frontend IDs as "new" participants
            // and creates duplicate participants in database (empty ID = create new).
            const syncedParticipantConfigs = chatParticipantsToConfig(participantsWithDates);
            actions.setSelectedParticipants(syncedParticipantConfigs);

            // ✅ Reset hasPendingConfigChanges since changes are now saved
            actions.setHasPendingConfigChanges(false);
          }

          // ✅ FIX: Sync thread state (enableWebSearch, mode) from response
          // BUG FIX: Store's thread.enableWebSearch stayed stale after toggle
          if (response?.data?.thread) {
            actions.setThread(transformChatThread(response.data.thread));
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
            // ✅ FIX: Sync thread state in fire-and-forget branch too
            if (response?.data?.thread) {
              actions.setThread(transformChatThread(response.data.thread));
            }
            actions.setHasPendingConfigChanges(false);
          }).catch((error) => {
            // Rollback optimistic update on failure
            console.error('[handleUpdateThreadAndSend] Failed to save configuration changes:', error);
            actions.updateParticipants(previousParticipants);
            showApiErrorToast('Failed to save configuration changes', error);
          });

          actions.setExpectedParticipantIds(getParticipantModelIds(optimisticParticipants));
        }
      } else {
        // No changes - just use current participants for expected IDs
        actions.setExpectedParticipantIds(getParticipantModelIds(threadState.participants));
      }

      // Prepare for new message (sets flags, pending message, attachment IDs, and pendingFileParts)
      // On THREAD screen, this also adds optimistic user message to UI
      // ✅ FIX: Pass fileParts so pendingFileParts is set for AI SDK message creation
      // ✅ BUG FIX: Pass empty array for participantIds to PRESERVE the already-correct expectedParticipantIds
      // Previously this passed threadState.participants which was captured at function START (stale)
      // setExpectedParticipantIds was already called above with correct new IDs
      // prepareForNewMessage would then OVERWRITE it with stale IDs, causing ID mismatch
      actions.prepareForNewMessage(
        trimmed,
        [], // Don't overwrite - expectedParticipantIds already set correctly above
        attachmentIds,
        fileParts,
      );

      // ✅ FIX: Set nextParticipantToTrigger for thread screen resumption (rounds 2+)
      // BUG FIX: handleCreateThread sets this (line 330) but handleUpdateThreadAndSend didn't
      // Without this, if user refreshes during round 2+ streaming, continueFromParticipant
      // effect can't resume because nextParticipantToTrigger is null (cleared by prepareForNewMessage)
      actions.setNextParticipantToTrigger(0);

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
      // - pending round in KV (for recovery)
      // We must revert these to restore a usable UI state

      console.error('[handleUpdateThreadAndSend] Error updating thread:', error);

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
  const handleModeChange = useCallback((mode: ChatMode) => {
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

  // ✅ SUBMIT STATE: Track whether any submission is in progress
  // This enables immediate UI feedback (loading spinner) on submit button
  const isSubmitting = createThreadMutation.isPending || updateThreadMutation.isPending;

  // Memoize return object to prevent unnecessary re-renders
  return useMemoizedReturn({
    handleCreateThread,
    handleUpdateThreadAndSend,
    handleResetForm,
    handleModeChange,
    handleWebSearchToggle,
    isFormValid,
    isSubmitting,
  }, [handleCreateThread, handleUpdateThreadAndSend, handleResetForm, handleModeChange, handleWebSearchToggle, isFormValid, isSubmitting]);
}
