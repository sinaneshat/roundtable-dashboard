import type { ChatMode } from '@roundtable/shared';
import { MessagePartTypes, MessageRoles } from '@roundtable/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { z } from 'zod';
import { useShallow } from 'zustand/react/shallow';

import { toCreateThreadRequest } from '@/components/chat/chat-form-schemas';
import { useChatStore, useChatStoreApi } from '@/components/providers/chat-store-provider/context';
import {
  useCreateThreadMutation,
  useUpdateThreadMutation,
} from '@/hooks/mutations';
import { MIN_PARTICIPANTS_REQUIRED } from '@/lib/config/participant-limits';
import { isListOrSidebarQuery, queryKeys } from '@/lib/data/query-keys';
import type { ExtendedFilePart } from '@/lib/schemas/message-schemas';
import { showApiErrorToast } from '@/lib/toast';
import { calculateNextRoundNumber, chatMessagesToUIMessages, chatParticipantsToConfig, createPrefetchMeta, getEnabledParticipantModelIds, getRoundNumber, prepareParticipantUpdate, shouldUpdateParticipantConfig, toISOString, toISOStringOrNull, transformChatMessages, transformChatParticipants, transformChatThread, useMemoizedReturn } from '@/lib/utils';
import { rlog } from '@/lib/utils/dev-logger';
import type { ChatParticipant } from '@/services/api';

import { createOptimisticUserMessage, createPlaceholderPreSearch } from '../utils/placeholder-factories';
import { validateInfiniteQueryCache } from './types';

/**
 * Attachment metadata passed from file upload handling
 */
export const AttachmentInfoSchema = z.object({
  uploadId: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  previewUrl: z.string().optional(),
});

export type AttachmentInfo = z.infer<typeof AttachmentInfoSchema>;

/**
 * Return type for useChatFormActions hook
 */
export type UseChatFormActionsReturn = {
  handleCreateThread: (attachmentIds?: string[], attachmentInfos?: AttachmentInfo[]) => Promise<void>;
  handleUpdateThreadAndSend: (threadId: string, attachmentIds?: string[], attachmentInfos?: AttachmentInfo[]) => Promise<void>;
  handleResetForm: () => void;
  handleModeChange: (mode: ChatMode) => void;
  handleWebSearchToggle: (enabled: boolean) => void;
  isFormValid: boolean;
  isSubmitting: boolean;
};

/**
 * Form action handlers for chat thread creation and updates
 *
 * Handles:
 * - Thread creation with optimistic UI
 * - Thread updates with config change detection
 * - Form state management and validation
 *
 * Uses storeApi.getState() for fresh state access to avoid stale closures
 */
export function useChatFormActions(): UseChatFormActionsReturn {
  const queryClient = useQueryClient();
  const storeApi = useChatStoreApi();

  const formState = useChatStore(useShallow(s => ({
    inputValue: s.inputValue,
    selectedMode: s.selectedMode,
    selectedParticipants: s.selectedParticipants,
    enableWebSearch: s.enableWebSearch,
  })));

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
    setStreamingRoundNumber: s.setStreamingRoundNumber,
    setNextParticipantToTrigger: s.setNextParticipantToTrigger,
    setMessages: s.setMessages,
    clearAttachments: s.clearAttachments,
    setThread: s.setThread,
    setIsWaitingForChangelog: s.setIsWaitingForChangelog,
    setConfigChangeRoundNumber: s.setConfigChangeRoundNumber,
    setIsPatchInProgress: s.setIsPatchInProgress,
    clearStreamResumption: s.clearStreamResumption,
    setPendingFileParts: s.setPendingFileParts,
    setPendingMessage: s.setPendingMessage,
    setPendingAttachmentIds: s.setPendingAttachmentIds,
    // ✅ RACE CONDITION FIX: Atomic config change state updates
    atomicUpdateConfigChangeState: s.atomicUpdateConfigChangeState,
    clearConfigChangeState: s.clearConfigChangeState,
    // ✅ RACE CONDITION FIX: Round epoch management
    startNewRound: s.startNewRound,
    // ✅ RACE CONDITION FIX: Explicit stream completion signal
    resetStreamFinishAcknowledgment: s.resetStreamFinishAcknowledgment,
  })));

  const createThreadMutation = useCreateThreadMutation();
  const updateThreadMutation = useUpdateThreadMutation();

  const isFormValid = Boolean(
    formState.inputValue.trim()
    && formState.selectedParticipants.length >= MIN_PARTICIPANTS_REQUIRED
    && formState.selectedMode,
  );

  const handleCreateThread = useCallback(async (attachmentIds?: string[], _attachmentInfos?: AttachmentInfo[]) => {
    // ✅ CRITICAL FIX: Use fresh state from storeApi instead of stale formState closure
    // After auto mode analysis updates the store, formState still has old values
    // This was causing enableWebSearch and participants from auto mode to be ignored
    const freshState = storeApi.getState();
    const prompt = freshState.inputValue.trim();
    const freshSelectedMode = freshState.selectedMode;
    const freshSelectedParticipants = freshState.selectedParticipants;
    const freshEnableWebSearch = freshState.enableWebSearch;

    if (!prompt || freshSelectedParticipants.length < MIN_PARTICIPANTS_REQUIRED || !freshSelectedMode) {
      return;
    }

    try {
      actions.setIsCreatingThread(true);

      const createThreadRequest = toCreateThreadRequest({
        message: prompt,
        mode: freshSelectedMode,
        participants: freshSelectedParticipants,
        enableWebSearch: freshEnableWebSearch,
      }, attachmentIds);

      const apiResponse = await createThreadMutation.mutateAsync({
        json: createThreadRequest,
      });

      if (!apiResponse) {
        throw new Error('No response from server');
      }

      if (!('success' in apiResponse) || !apiResponse.success || !('data' in apiResponse) || !apiResponse.data) {
        throw new Error('Invalid response from server');
      }

      const { thread, participants, messages: initialMessages } = apiResponse.data;

      const threadWithDates = transformChatThread(thread);
      const participantsWithDates = transformChatParticipants(participants);
      const messagesWithDates = transformChatMessages(initialMessages);

      actions.setShowInitialUI(false);
      actions.setCreatedThreadId(thread.id);

      const uiMessages = chatMessagesToUIMessages(messagesWithDates);

      actions.initializeThread(threadWithDates, participantsWithDates, uiMessages);

      const syncedParticipantConfigs = chatParticipantsToConfig(participantsWithDates);
      actions.setSelectedParticipants(syncedParticipantConfigs);

      queryClient.setQueriesData(
        {
          queryKey: queryKeys.threads.all,
          predicate: isListOrSidebarQuery,
        },
        (old: unknown) => {
          const parsedQuery = validateInfiniteQueryCache(old);
          if (!parsedQuery)
            return old;

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

      // ✅ FIX: Pre-populate thread-by-slug cache BEFORE URL update
      // This prevents skeleton flash when navigating to /chat/{slug} later
      // The cache entry includes prefetch meta so loader knows data is fresh
      queryClient.setQueryData(queryKeys.threads.bySlug(thread.slug), {
        success: true,
        data: {
          thread: {
            ...thread,
            createdAt: toISOString(thread.createdAt),
            updatedAt: toISOString(thread.updatedAt),
            lastMessageAt: toISOStringOrNull(thread.lastMessageAt),
          },
          participants: participantsWithDates.map(p => ({
            ...p,
            createdAt: toISOString(p.createdAt),
            updatedAt: toISOString(p.updatedAt),
          })),
          messages: messagesWithDates,
        },
        meta: createPrefetchMeta(),
      });

      // Also pre-populate by thread ID for consistency
      queryClient.setQueryData(queryKeys.threads.detail(thread.id), {
        success: true,
        data: {
          thread: {
            ...thread,
            createdAt: toISOString(thread.createdAt),
            updatedAt: toISOString(thread.updatedAt),
            lastMessageAt: toISOStringOrNull(thread.lastMessageAt),
          },
          participants: participantsWithDates.map(p => ({
            ...p,
            createdAt: toISOString(p.createdAt),
            updatedAt: toISOString(p.updatedAt),
          })),
          messages: messagesWithDates,
        },
        meta: createPrefetchMeta(),
      });

      queueMicrotask(() => {
        window.history.replaceState(
          window.history.state,
          '',
          `/chat/${thread.slug}`,
        );
      });

      actions.setInputValue('');
      actions.clearAttachments();

      if (freshEnableWebSearch) {
        actions.addPreSearch(createPlaceholderPreSearch({
          threadId: thread.id,
          roundNumber: 0,
          userQuery: prompt,
        }));
      }

      actions.prepareForNewMessage(prompt, getEnabledParticipantModelIds(participants), attachmentIds);
      actions.setStreamingRoundNumber(0);
      actions.setWaitingToStartStreaming(true);
      const firstParticipant = participantsWithDates[0];
      if (firstParticipant) {
        actions.setNextParticipantToTrigger({ index: 0, participantId: firstParticipant.id });
      }
    } catch (error) {
      showApiErrorToast('Error creating thread', error);
      actions.setShowInitialUI(true);
    } finally {
      actions.setIsCreatingThread(false);
    }
  }, [
    storeApi,
    createThreadMutation,
    actions,
    queryClient,
  ]);

  const handleUpdateThreadAndSend = useCallback(async (threadId: string, attachmentIds?: string[], attachmentInfos?: AttachmentInfo[]) => {
    const trimmed = formState.inputValue.trim();

    if (!trimmed || formState.selectedParticipants.length === 0 || !formState.selectedMode) {
      return;
    }

    // ✅ CRITICAL FIX: Clear stale resumption state from previous rounds
    // Without this, currentResumptionPhase='complete' from round N persists into round N+1
    // This causes initializeThread to wipe pendingMessage because preserveStreamingState=false
    actions.clearStreamResumption();

    const freshState = storeApi.getState();
    const freshThread = freshState.thread;
    const freshParticipants = freshState.participants;
    const freshMessages = freshState.messages;
    const freshHasPendingConfigChanges = freshState.hasPendingConfigChanges;
    const freshSelectedMode = freshState.selectedMode;
    const freshEnableWebSearch = freshState.enableWebSearch;
    const freshSelectedParticipants = freshState.selectedParticipants;

    let nextRoundNumber = calculateNextRoundNumber(freshMessages);
    if (nextRoundNumber === 0 && freshMessages.length > 0) {
      const round0AssistantMessages = freshMessages.filter(
        m => m.role === MessageRoles.ASSISTANT && getRoundNumber(m.metadata) === 0,
      );
      if (round0AssistantMessages.length > 0) {
        const userMessages = freshMessages.filter(m => m.role === MessageRoles.USER);
        nextRoundNumber = userMessages.length;
      }
    }

    const { updateResult, updatePayloads, optimisticParticipants } = prepareParticipantUpdate(
      freshParticipants as ChatParticipant[],
      freshSelectedParticipants,
      threadId,
    );

    const currentModeId = freshThread?.mode || null;
    const currentWebSearch = freshThread?.enableWebSearch || false;
    const modeChanged = currentModeId !== freshSelectedMode;
    const webSearchChanged = currentWebSearch !== freshEnableWebSearch;

    const hasParticipantChanges = shouldUpdateParticipantConfig(updateResult);
    const hasAnyChanges = hasParticipantChanges || modeChanged || webSearchChanged || freshHasPendingConfigChanges;

    rlog.submit('changes-detected', `r${nextRoundNumber} hasAny=${hasAnyChanges} participants=${hasParticipantChanges} mode=${modeChanged}(${currentModeId}→${freshSelectedMode}) webSearch=${webSearchChanged}(${currentWebSearch}→${freshEnableWebSearch}) pending=${freshHasPendingConfigChanges} files=${attachmentIds?.length || 0}`);

    // ✅ BUG FIX: Filter out attachments without uploadId to prevent broken file previews
    // uploadId is required for backend fallback when previewUrl is empty (e.g., PDFs)
    const fileParts: ExtendedFilePart[] = attachmentInfos && attachmentInfos.length > 0
      ? attachmentInfos
          .filter((att) => {
            if (!att.uploadId) {
              rlog.submit('file-part-error', `Missing uploadId for ${att.filename} - skipping`);
              return false;
            }
            return true;
          })
          .map(att => ({
            type: MessagePartTypes.FILE,
            url: att.previewUrl || '',
            filename: att.filename,
            mediaType: att.mimeType,
            uploadId: att.uploadId,
          }))
      : [];

    const optimisticMessage = createOptimisticUserMessage({
      roundNumber: nextRoundNumber,
      text: trimmed,
      fileParts,
    });

    actions.setMessages((currentMessages) => {
      return [...currentMessages, optimisticMessage];
    });
    actions.setStreamingRoundNumber(nextRoundNumber);
    const effectiveParticipants = hasParticipantChanges ? optimisticParticipants : (freshParticipants as ChatParticipant[]);
    actions.setExpectedParticipantIds(getEnabledParticipantModelIds(effectiveParticipants));

    if (hasParticipantChanges) {
      actions.updateParticipants(optimisticParticipants);
    }

    // ✅ RACE CONDITION FIX: Atomically set all config change flags together
    // This prevents effects from seeing inconsistent state (e.g., isPatchInProgress=true but configChangeRoundNumber=null)
    if (hasAnyChanges) {
      rlog.submit('pre-patch-flag', `r${nextRoundNumber} atomic: configChangeRoundNumber + isPatchInProgress`);
      actions.atomicUpdateConfigChangeState({
        configChangeRoundNumber: nextRoundNumber,
        isPatchInProgress: true,
        hasPendingConfigChanges: false, // Clear pending since we're about to apply
      });
    } else {
      // Still need isPatchInProgress even without config changes
      actions.atomicUpdateConfigChangeState({
        isPatchInProgress: true,
      });
    }

    if (freshEnableWebSearch) {
      actions.addPreSearch(createPlaceholderPreSearch({
        threadId,
        roundNumber: nextRoundNumber,
        userQuery: trimmed,
      }));
    }

    // CRITICAL: Set pending file parts for the hook to access via refs
    // This MUST be set before setWaitingToStartStreaming so the streaming hook can read the file parts
    actions.setPendingFileParts(fileParts.length > 0 ? fileParts : null);
    actions.setPendingMessage(trimmed);
    actions.setPendingAttachmentIds(attachmentIds?.length ? attachmentIds : null);

    // ✅ RACE CONDITION FIX: Reset stream finish acknowledgment for new round
    actions.resetStreamFinishAcknowledgment();

    // ✅ RACE CONDITION FIX: Use startNewRound to atomically set round number and increment epoch
    // This allows effects to detect stale operations by comparing epochs
    const roundEpoch = actions.startNewRound(nextRoundNumber);
    rlog.submit('round-epoch', `r${nextRoundNumber} epoch=${roundEpoch}`);

    actions.setWaitingToStartStreaming(true);
    const firstParticipant = freshParticipants[0];
    if (firstParticipant) {
      actions.setNextParticipantToTrigger({ index: 0, participantId: firstParticipant.id });
    }

    actions.setInputValue('');
    actions.clearAttachments();

    try {
      const apiResponse = await updateThreadMutation.mutateAsync({
        param: { id: threadId },
        json: {
          participants: hasParticipantChanges ? updatePayloads : undefined,
          mode: modeChanged && freshSelectedMode ? freshSelectedMode : undefined,
          enableWebSearch: webSearchChanged ? freshEnableWebSearch : undefined,
          newMessage: {
            id: optimisticMessage.id,
            content: trimmed,
            roundNumber: nextRoundNumber,
            attachmentIds: attachmentIds?.length ? attachmentIds : undefined,
          },
        },
      });

      if (!apiResponse.success) {
        throw new Error('Invalid response from server');
      }

      const responseData = apiResponse.data;

      if (responseData?.message) {
        const persistedMessage = responseData.message;
        const persistedUIMessage = chatMessagesToUIMessages([persistedMessage])[0];
        if (persistedUIMessage) {
          actions.setMessages(currentMessages => currentMessages.map(m =>
            m.id === optimisticMessage.id ? persistedUIMessage : m,
          ));
        }
      }

      if (responseData?.participants) {
        const participantsWithDates = transformChatParticipants(responseData.participants);
        actions.updateParticipants(participantsWithDates);
        actions.setExpectedParticipantIds(getEnabledParticipantModelIds(participantsWithDates));

        const syncedParticipantConfigs = chatParticipantsToConfig(participantsWithDates);
        actions.setSelectedParticipants(syncedParticipantConfigs);

        const newFirstParticipant = participantsWithDates[0];
        if (newFirstParticipant) {
          actions.setNextParticipantToTrigger({ index: 0, participantId: newFirstParticipant.id });
        }
      }

      if (responseData?.thread) {
        actions.setThread(transformChatThread(responseData.thread));
      }

      // ✅ RACE CONDITION FIX: Atomically update all config change flags after PATCH
      if (hasAnyChanges) {
        rlog.submit('post-patch-flag', `r${nextRoundNumber} atomic: isPatchInProgress=false, isWaitingForChangelog=true`);
        actions.atomicUpdateConfigChangeState({
          isPatchInProgress: false,
          isWaitingForChangelog: true,
          hasPendingConfigChanges: false,
          // Keep configChangeRoundNumber until changelog is fetched
        });
      } else {
        rlog.submit('no-changelog', `r${nextRoundNumber} atomic: clearing config change state`);
        actions.clearConfigChangeState();
      }
    } catch (error) {
      actions.setMessages(currentMessages => currentMessages.filter(m => m.id !== optimisticMessage.id));

      actions.setWaitingToStartStreaming(false);
      actions.setStreamingRoundNumber(null);
      actions.setNextParticipantToTrigger(null);

      // ✅ RACE CONDITION FIX: Atomically clear all config change flags on error
      rlog.submit('patch-error', `r${nextRoundNumber} atomic: clearing all config change state`);
      actions.clearConfigChangeState();

      showApiErrorToast('Error updating thread', error);
    }
  }, [
    formState,
    storeApi,
    updateThreadMutation,
    actions,
  ]);

  const handleResetForm = useCallback(() => {
    actions.resetForm();
  }, [actions]);

  const handleModeChange = useCallback((mode: ChatMode) => {
    actions.setHasPendingConfigChanges(true);
    actions.setSelectedMode(mode);
  }, [actions]);

  const handleWebSearchToggle = useCallback((enabled: boolean) => {
    const freshThread = storeApi.getState().thread;
    const freshCreatedThreadId = storeApi.getState().createdThreadId;
    if (freshThread || freshCreatedThreadId) {
      actions.setHasPendingConfigChanges(true);
    }
    actions.setEnableWebSearch(enabled);
  }, [actions, storeApi]);

  const isSubmitting = createThreadMutation.isPending || updateThreadMutation.isPending;

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
