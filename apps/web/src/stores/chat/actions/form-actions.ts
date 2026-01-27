import type { ChatMode } from '@roundtable/shared';
import { MessagePartTypes, MessageRoles } from '@roundtable/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
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
import { isNonProjectListOrSidebarQuery, queryKeys } from '@/lib/data/query-keys';
import type { ExtendedFilePart } from '@/lib/schemas/message-schemas';
import { showApiErrorToast } from '@/lib/toast';
import { calculateNextRoundNumber, chatMessagesToUIMessages, chatParticipantsToConfig, createPrefetchMeta, getEnabledParticipantModelIds, getRoundNumber, prepareParticipantUpdate, shouldUpdateParticipantConfig, toISOString, toISOStringOrNull, transformChatMessages, transformChatParticipants, transformChatThread, useMemoizedReturn } from '@/lib/utils';
import { rlog } from '@/lib/utils/dev-logger';

import { createOptimisticChangelogItems, createOptimisticUserMessage, createPlaceholderPreSearch } from '../utils/placeholder-factories';
import { validateInfiniteQueryCache } from './types';

/**
 * Attachment metadata passed from file upload handling
 */
export const AttachmentInfoSchema = z.object({
  filename: z.string(),
  mimeType: z.string(),
  previewUrl: z.string().optional(),
  uploadId: z.string(),
});

export type AttachmentInfo = z.infer<typeof AttachmentInfoSchema>;

/**
 * Return type for useChatFormActions hook
 */
export type UseChatFormActionsReturn = {
  handleCreateThread: (attachmentIds?: string[], attachmentInfos?: AttachmentInfo[], projectId?: string) => Promise<void>;
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
  const router = useRouter();
  const storeApi = useChatStoreApi();

  const formState = useChatStore(useShallow(s => ({
    enableWebSearch: s.enableWebSearch,
    inputValue: s.inputValue,
    selectedMode: s.selectedMode,
    selectedParticipants: s.selectedParticipants,
  })));

  const actions = useChatStore(useShallow(s => ({
    addChangelogItems: s.addChangelogItems,
    addPreSearch: s.addPreSearch,
    clearAttachments: s.clearAttachments,
    createStreamingPlaceholders: s.createStreamingPlaceholders,
    initializeThread: s.initializeThread,
    prepareForNewMessage: s.prepareForNewMessage,
    resetForm: s.resetForm,
    setCreatedThreadId: s.setCreatedThreadId,
    setCreatedThreadProjectId: s.setCreatedThreadProjectId,
    setCurrentRoundNumber: s.setCurrentRoundNumber,
    setEnableWebSearch: s.setEnableWebSearch,
    setExpectedModelIds: s.setExpectedModelIds,
    setHasInitiallyLoaded: s.setHasInitiallyLoaded,
    setInputValue: s.setInputValue,
    setIsCreatingThread: s.setIsCreatingThread,
    setMessages: s.setMessages,
    setPendingAttachmentIds: s.setPendingAttachmentIds,
    setPendingFileParts: s.setPendingFileParts,
    setPendingMessage: s.setPendingMessage,
    setSelectedMode: s.setSelectedMode,
    setSelectedParticipants: s.setSelectedParticipants,
    setShowInitialUI: s.setShowInitialUI,
    setStreamingRoundNumber: s.setStreamingRoundNumber,
    setThread: s.setThread,
    setWaitingToStartStreaming: s.setWaitingToStartStreaming,
    updateParticipants: s.updateParticipants,
  })));

  const createThreadMutation = useCreateThreadMutation();
  const updateThreadMutation = useUpdateThreadMutation();

  const isFormValid = Boolean(
    formState.inputValue.trim()
    && formState.selectedParticipants.length >= MIN_PARTICIPANTS_REQUIRED
    && formState.selectedMode,
  );

  const handleCreateThread = useCallback(async (attachmentIds?: string[], _attachmentInfos?: AttachmentInfo[], projectId?: string) => {
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
        enableWebSearch: freshEnableWebSearch,
        message: prompt,
        mode: freshSelectedMode,
        participants: freshSelectedParticipants,
      }, attachmentIds, projectId);

      const apiResponse = await createThreadMutation.mutateAsync({
        json: createThreadRequest,
      });

      if (!apiResponse) {
        throw new Error('No response from server');
      }

      if (!('success' in apiResponse) || !apiResponse.success || !('data' in apiResponse) || !apiResponse.data) {
        throw new Error('Invalid response from server');
      }

      const { messages: initialMessages, participants, thread } = apiResponse.data;

      const threadWithDates = transformChatThread(thread);
      const participantsWithDates = transformChatParticipants(participants);
      const messagesWithDates = transformChatMessages(initialMessages);

      actions.setShowInitialUI(false);
      actions.setCreatedThreadId(thread.id);
      actions.setCreatedThreadProjectId(projectId ?? null);
      rlog.flow('create', `1-setCreatedThreadId id=${thread.id.slice(-8)} projectId=${projectId ?? 'none'}`);

      const uiMessages = chatMessagesToUIMessages(messagesWithDates);

      actions.initializeThread(threadWithDates, participantsWithDates, uiMessages);
      // ✅ STREAMING TRIGGER FIX: Enable Store→AI SDK sync in ChatStoreProvider
      // Without this, chat.isReady stays false and streaming never starts
      actions.setHasInitiallyLoaded(true);
      rlog.flow('create', `2-initializeThread done parts=${participantsWithDates.length} msgs=${uiMessages.length}`);

      const syncedParticipantConfigs = chatParticipantsToConfig(participantsWithDates);
      actions.setSelectedParticipants(syncedParticipantConfigs);

      // Thread item for cache updates
      const threadItem = {
        createdAt: thread.createdAt,
        enableWebSearch: thread.enableWebSearch,
        id: thread.id,
        isAiGeneratedTitle: thread.isAiGeneratedTitle,
        isFavorite: thread.isFavorite,
        isPublic: thread.isPublic,
        lastMessageAt: thread.lastMessageAt,
        mode: thread.mode,
        slug: thread.slug,
        status: thread.status,
        title: thread.title,
        updatedAt: thread.updatedAt,
      };

      // ✅ STEP 1: Pre-populate thread detail caches BEFORE navigation
      // This prevents skeleton flash when route loader runs
      queryClient.setQueryData(queryKeys.threads.bySlug(thread.slug), {
        data: {
          messages: messagesWithDates,
          participants: participantsWithDates.map(p => ({
            ...p,
            createdAt: toISOString(p.createdAt),
            updatedAt: toISOString(p.updatedAt),
          })),
          thread: {
            ...thread,
            createdAt: toISOString(thread.createdAt),
            lastMessageAt: toISOStringOrNull(thread.lastMessageAt),
            updatedAt: toISOString(thread.updatedAt),
          },
        },
        meta: createPrefetchMeta(),
        success: true,
      });

      queryClient.setQueryData(queryKeys.threads.detail(thread.id), {
        data: {
          messages: messagesWithDates,
          participants: participantsWithDates.map(p => ({
            ...p,
            createdAt: toISOString(p.createdAt),
            updatedAt: toISOString(p.updatedAt),
          })),
          thread: {
            ...thread,
            createdAt: toISOString(thread.createdAt),
            lastMessageAt: toISOStringOrNull(thread.lastMessageAt),
            updatedAt: toISOString(thread.updatedAt),
          },
        },
        meta: createPrefetchMeta(),
        success: true,
      });

      // ✅ STEP 2: Navigate BEFORE sidebar cache updates
      // This ensures URL is updated when sidebar re-renders from cache change
      rlog.flow('create', `3-navigate slug=${thread.slug} projectId=${projectId ?? 'none'}`);
      if (projectId) {
        router.navigate({
          params: { projectId, slug: thread.slug },
          replace: true,
          to: '/chat/projects/$projectId/$slug',
        });
      } else {
        router.navigate({
          params: { slug: thread.slug },
          replace: true,
          to: '/chat/$slug',
        });
      }

      // ✅ STEP 3: Update sidebar list caches AFTER navigation
      // When React re-renders sidebar, URL already reflects new thread
      if (projectId) {
        const projectThreadsKey = queryKeys.projects.threads(projectId);
        const existingData = queryClient.getQueryData(projectThreadsKey);
        const parsedExisting = validateInfiniteQueryCache(existingData);

        if (parsedExisting) {
          queryClient.setQueryData(
            projectThreadsKey,
            {
              ...parsedExisting,
              pages: parsedExisting.pages.map((page, index) => {
                if (index !== 0 || !page.success || !page.data?.items) {
                  return page;
                }

                return {
                  ...page,
                  data: {
                    ...page.data,
                    items: [threadItem, ...page.data.items],
                  },
                };
              }),
            },
          );
        } else {
          queryClient.setQueryData(
            projectThreadsKey,
            {
              pageParams: [undefined],
              pages: [{
                data: { items: [threadItem], pagination: { nextCursor: null } },
                meta: createPrefetchMeta(),
                success: true,
              }],
            },
          );
        }

        // Increment thread count in sidebar projects cache
        queryClient.setQueriesData(
          { queryKey: queryKeys.projects.sidebar() },
          (old: unknown) => {
            const parsedQuery = validateInfiniteQueryCache(old);
            if (!parsedQuery) {
              return old;
            }

            return {
              ...parsedQuery,
              pages: parsedQuery.pages.map((page) => {
                if (!page.success || !page.data?.items) {
                  return page;
                }

                return {
                  ...page,
                  data: {
                    ...page.data,
                    items: page.data.items.map((item: { id: string; threadCount?: number }) =>
                      item.id === projectId
                        ? { ...item, threadCount: (item.threadCount ?? 0) + 1 }
                        : item,
                    ),
                  },
                };
              }),
            };
          },
        );
      } else {
        queryClient.setQueriesData(
          {
            predicate: isNonProjectListOrSidebarQuery,
            queryKey: queryKeys.threads.all,
          },
          (old: unknown) => {
            const parsedQuery = validateInfiniteQueryCache(old);
            if (!parsedQuery) {
              return old;
            }

            return {
              ...parsedQuery,
              pages: parsedQuery.pages.map((page, index) => {
                if (index !== 0 || !page.success || !page.data?.items) {
                  return page;
                }

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
      }

      // ✅ DELAYED INVALIDATION: Ensure project caches are fresh after SSR
      // Optimistic updates above are immediate, but invalidation ensures consistency
      if (projectId) {
        setTimeout(() => {
          // Invalidate project threads to ensure SSR hydration gets fresh data
          queryClient.invalidateQueries({ queryKey: queryKeys.projects.threads(projectId) });
          queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
          // Also refresh attachments if any were uploaded (auto-link runs async)
          if (attachmentIds?.length) {
            queryClient.invalidateQueries({ queryKey: queryKeys.projects.attachments(projectId) });
          }
        }, 1000);
      }

      actions.setInputValue('');
      actions.clearAttachments();
      rlog.flow('create', `5-clearInput webSearch=${freshEnableWebSearch ? 1 : 0}`);

      if (freshEnableWebSearch) {
        actions.addPreSearch(createPlaceholderPreSearch({
          roundNumber: 0,
          threadId: thread.id,
          userQuery: prompt,
        }));
      }

      // Set pending state for new message flow
      actions.setPendingMessage(prompt);
      actions.setExpectedModelIds(getEnabledParticipantModelIds(participants));
      if (attachmentIds?.length) {
        actions.setPendingAttachmentIds(attachmentIds);
      }
      actions.prepareForNewMessage();
      rlog.flow('create', `6-prepareForNewMessage done`);

      actions.setStreamingRoundNumber(0);
      actions.setCurrentRoundNumber(0);
      actions.setWaitingToStartStreaming(true);
      rlog.flow('create', `7-setWaitingToStartStreaming=true`);

      // ✅ DEBUG: Log final state after all setup
      const finalState = storeApi.getState();
      rlog.flow('create', `8-FINAL wait=${finalState.waitingToStartStreaming ? 1 : 0} pending=${finalState.pendingMessage ? 1 : 0} created=${finalState.createdThreadId?.slice(-8) ?? '-'}`);
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
    router,
  ]);

  const handleUpdateThreadAndSend = useCallback(async (threadId: string, attachmentIds?: string[], attachmentInfos?: AttachmentInfo[]) => {
    const trimmed = formState.inputValue.trim();

    if (!trimmed || formState.selectedParticipants.length === 0 || !formState.selectedMode) {
      return;
    }

    const freshState = storeApi.getState();
    const freshThread = freshState.thread;
    const freshParticipants = freshState.participants;
    const freshMessages = freshState.messages;
    const freshSelectedMode = freshState.selectedMode;
    const freshEnableWebSearch = freshState.enableWebSearch;
    let freshSelectedParticipants = freshState.selectedParticipants;

    // ✅ FIX: Defensive check for stale closure race condition
    // formState.selectedParticipants (from hook) might be stale while freshState is empty
    // If fresh state has empty selectedParticipants but modelOrder has models, create participants from modelOrder
    const freshModelOrder = freshState.modelOrder;
    if (freshSelectedParticipants.length === 0 && freshModelOrder.length > 0) {
      rlog.submit('sync-modelOrder-to-participants', `r${calculateNextRoundNumber(freshMessages)} creating ${freshModelOrder.length} participants from modelOrder`);
      freshSelectedParticipants = freshModelOrder.map((modelId, index) => ({
        id: modelId,
        modelId,
        priority: index,
        role: '',
      }));
      // Update store to prevent future desyncs
      actions.setSelectedParticipants(freshSelectedParticipants);
    }

    // ✅ FIX: Additional guard - if still empty after sync attempt, abort
    if (freshSelectedParticipants.length === 0) {
      rlog.submit('abort-empty-participants', `r${calculateNextRoundNumber(freshMessages)} cannot proceed with 0 participants`);
      return;
    }

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

    // participants from store is already typed as ChatParticipant[] via ChatParticipantSchema
    const { optimisticParticipants, updatePayloads, updateResult } = prepareParticipantUpdate(
      freshParticipants,
      freshSelectedParticipants,
      threadId,
    );

    const currentModeId = freshThread?.mode || null;
    const currentWebSearch = freshThread?.enableWebSearch || false;
    const modeChanged = currentModeId !== freshSelectedMode;
    const webSearchChanged = currentWebSearch !== freshEnableWebSearch;

    const hasParticipantChanges = shouldUpdateParticipantConfig(updateResult);
    const hasAnyChanges = hasParticipantChanges || modeChanged || webSearchChanged;

    rlog.submit('changes-detected', `r${nextRoundNumber} hasAny=${hasAnyChanges} participants=${hasParticipantChanges} mode=${modeChanged}(${currentModeId}→${freshSelectedMode}) webSearch=${webSearchChanged}(${currentWebSearch}→${freshEnableWebSearch}) files=${attachmentIds?.length || 0}`);

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
            filename: att.filename,
            mediaType: att.mimeType,
            type: MessagePartTypes.FILE,
            uploadId: att.uploadId,
            url: att.previewUrl || '',
          }))
      : [];

    const optimisticMessage = createOptimisticUserMessage({
      fileParts,
      roundNumber: nextRoundNumber,
      text: trimmed,
    });

    actions.setMessages((currentMessages) => {
      return [...currentMessages, optimisticMessage];
    });
    actions.setStreamingRoundNumber(nextRoundNumber);
    // participants from store is already typed as ChatParticipant[] via ChatParticipantSchema
    const effectiveParticipants = hasParticipantChanges ? optimisticParticipants : freshParticipants;
    actions.setExpectedModelIds(getEnabledParticipantModelIds(effectiveParticipants));

    // ✅ FIX: Update participants BEFORE creating placeholders
    // createStreamingPlaceholders reads from store.participants, so we must update first
    // Otherwise placeholders get stale participant IDs from the previous round
    if (hasParticipantChanges) {
      actions.updateParticipants(optimisticParticipants);
    }

    // ✅ FRAME 8 FIX: Create streaming placeholders immediately so UI shows them on send
    // This ensures placeholders appear instantly (Frame 8) before async startRoundService() completes
    // Without this, Round 2+ has a visible gap where user message appears but no placeholders
    const enabledCount = effectiveParticipants.filter(p => p.isEnabled).length;
    actions.createStreamingPlaceholders(nextRoundNumber, enabledCount);
    rlog.frame(8, 'optimistic-placeholders', `r${nextRoundNumber} ${enabledCount} placeholders created immediately`);

    if (freshEnableWebSearch) {
      actions.addPreSearch(createPlaceholderPreSearch({
        roundNumber: nextRoundNumber,
        threadId,
        userQuery: trimmed,
      }));
    }

    // ✅ FRAME 9 FIX: Create optimistic changelog items immediately so UI shows them on send
    // This ensures changelog appears instantly (Frame 9) before async API call completes
    // Without this, changelog only appears after the entire round finishes
    if (hasAnyChanges) {
      const optimisticChangelog = createOptimisticChangelogItems({
        currentParticipants: freshParticipants,
        newMode: freshSelectedMode,
        newWebSearch: freshEnableWebSearch,
        oldMode: currentModeId,
        oldWebSearch: currentWebSearch,
        roundNumber: nextRoundNumber,
        selectedParticipants: freshSelectedParticipants,
        threadId,
      });
      if (optimisticChangelog.length > 0) {
        actions.addChangelogItems(optimisticChangelog);
        rlog.frame(9, 'optimistic-changelog', `r${nextRoundNumber} ${optimisticChangelog.length} changelog items created immediately`);
      }
    }

    // CRITICAL: Set pending file parts for the hook to access via refs
    // This MUST be set before setWaitingToStartStreaming so the streaming hook can read the file parts
    actions.setPendingFileParts(fileParts.length > 0 ? fileParts : null);
    actions.setPendingMessage(trimmed);
    actions.setPendingAttachmentIds(attachmentIds?.length ? attachmentIds : null);

    // Set round number and trigger streaming
    actions.setCurrentRoundNumber(nextRoundNumber);
    actions.setWaitingToStartStreaming(true);

    actions.setInputValue('');
    actions.clearAttachments();

    try {
      const apiResponse = await updateThreadMutation.mutateAsync({
        json: {
          enableWebSearch: webSearchChanged ? freshEnableWebSearch : undefined,
          mode: modeChanged && freshSelectedMode ? freshSelectedMode : undefined,
          newMessage: {
            attachmentIds: attachmentIds?.length ? attachmentIds : undefined,
            content: trimmed,
            id: optimisticMessage.id,
            roundNumber: nextRoundNumber,
          },
          participants: hasParticipantChanges ? updatePayloads : undefined,
        },
        param: { id: threadId },
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

      // ✅ RACE CONDITION FIX: Guard against empty array ([] is truthy but wipes store)
      if (responseData?.participants && responseData.participants.length > 0) {
        const participantsWithDates = transformChatParticipants(responseData.participants);
        actions.updateParticipants(participantsWithDates);
        actions.setExpectedModelIds(getEnabledParticipantModelIds(participantsWithDates));

        const syncedParticipantConfigs = chatParticipantsToConfig(participantsWithDates);
        actions.setSelectedParticipants(syncedParticipantConfigs);
      } else if (responseData?.participants?.length === 0) {
        rlog.submit('skip-empty-participants', `r${nextRoundNumber} server returned empty, preserving existing`);
      }

      if (responseData?.thread) {
        actions.setThread(transformChatThread(responseData.thread));
      }
    } catch (error) {
      actions.setMessages(currentMessages => currentMessages.filter(m => m.id !== optimisticMessage.id));

      actions.setWaitingToStartStreaming(false);
      actions.setStreamingRoundNumber(null);

      rlog.submit('patch-error', `r${nextRoundNumber} error updating thread`);
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
    actions.setSelectedMode(mode);
  }, [actions]);

  const handleWebSearchToggle = useCallback((enabled: boolean) => {
    actions.setEnableWebSearch(enabled);
  }, [actions]);

  const isSubmitting = createThreadMutation.isPending || updateThreadMutation.isPending;

  return useMemoizedReturn({
    handleCreateThread,
    handleModeChange,
    handleResetForm,
    handleUpdateThreadAndSend,
    handleWebSearchToggle,
    isFormValid,
    isSubmitting,
  }, [handleCreateThread, handleUpdateThreadAndSend, handleResetForm, handleModeChange, handleWebSearchToggle, isFormValid, isSubmitting]);
}
