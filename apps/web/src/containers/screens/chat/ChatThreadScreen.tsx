import { isCompletionFinishReason, UploadStatuses } from '@roundtable/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { ChatThreadActions } from '@/components/chat/chat-thread-actions';
import { useThreadHeader } from '@/components/chat/thread-header-context';
import { useChatStore, useModelPreferencesStore } from '@/components/providers';
import { useDeleteProjectMemoryMutation } from '@/hooks/mutations';
import { useModelsQuery } from '@/hooks/queries';
import { useBoolean, useChatAttachments } from '@/hooks/utils';
import { useTranslations } from '@/lib/i18n';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { toastManager } from '@/lib/toast';
import {
  chatMessagesToUIMessages,
  getCurrentRoundNumber,
  getDetailedIncompatibleModelIds,
  getModeratorMetadata,
  isDocumentFile,
  isImageFile,
  threadHasDocumentFiles,
  threadHasImageFiles,
} from '@/lib/utils';
import { rlog } from '@/lib/utils/dev-logger';
import dynamic from '@/lib/utils/dynamic';
import type { ApiMessage, ApiParticipant, ChangelogItem, ChatThread, GetThreadMemoryEventsResponse, Model, StoredPreSearch, ThreadDetailData } from '@/services/api';
import { getThreadMemoryEventsService } from '@/services/api';
import {
  getModeratorMessageForRound,
  useChatFormActions,
  useSyncHydrateStore,
} from '@/stores/chat';

import { ChatView } from './ChatView';

/**
 * Memory event data for inline display under user messages
 */
export type MemoryEvent = {
  id: string;
  summary: string;
  content: string;
};

export type MemoryEventsByRound = Map<number, MemoryEvent[]>;

const ChatDeleteDialog = dynamic(
  () => import('@/components/chat/chat-delete-dialog').then(m => ({ default: m.ChatDeleteDialog })),
  { ssr: false },
);

type ChatThreadScreenProps = {
  thread: ChatThread;
  participants: ApiParticipant[];
  initialMessages: ApiMessage[];
  slug: string;
  user: ThreadDetailData['user'];
  /** Pre-searched data prefetched on server for SSR hydration */
  initialPreSearches?: StoredPreSearch[];
  /** Changelog items prefetched on server for SSR hydration */
  initialChangelog?: ChangelogItem[];
};

function useThreadHeaderUpdater({
  onDeleteClick,
  slug,
  thread,
}: {
  thread: ChatThread;
  slug: string;
  onDeleteClick: () => void;
}) {
  const { setThreadActions } = useThreadHeader();

  const threadActions = useMemo(
    () => (
      <ChatThreadActions
        thread={thread}
        slug={slug}
        onDeleteClick={onDeleteClick}
      />
    ),
    [thread, slug, onDeleteClick],
  );

  useEffect(() => {
    setThreadActions(threadActions);
    return () => setThreadActions(null);
  }, [threadActions, setThreadActions]);
}

export default function ChatThreadScreen({
  initialChangelog,
  initialMessages,
  initialPreSearches,
  participants,
  slug,
  thread,
  user,
}: ChatThreadScreenProps) {
  const t = useTranslations();
  const isDeleteDialogOpen = useBoolean(false);
  const chatAttachments = useChatAttachments();
  // Track initial mount to skip showing "models deselected" toast on page load
  const hasCompletedInitialMountRef = useRef(false);
  // Memory events by round for inline display under user messages
  const [memoryEventsByRound, setMemoryEventsByRound] = useState<MemoryEventsByRound>(() => new Map());

  // ✅ SSR HYDRATION: Compute uiMessages early for sync hydration
  const uiMessages = useMemo(
    () => chatMessagesToUIMessages(initialMessages, participants),
    [initialMessages, participants],
  );

  // ✅ SSR HYDRATION: Hydrate store synchronously BEFORE any useChatStore calls
  // This ensures first paint has content - no loading flash
  useSyncHydrateStore({
    initialChangelog,
    initialMessages: uiMessages,
    initialPreSearches,
    participants,
    thread,
  });

  // 🔍 DEBUG: Log props vs what useSyncHydrateStore received
  rlog.init('screen-props', `t=${thread.id?.slice(-8)} slug=${thread.slug} msgs=${uiMessages.length} parts=${participants.length}`);

  useThreadHeaderUpdater({ onDeleteClick: isDeleteDialogOpen.onTrue, slug, thread });

  const { setSelectedModelIds } = useModelPreferencesStore(useShallow(s => ({
    setSelectedModelIds: s.setSelectedModelIds,
  })));

  const {
    inputValue,
    isModeratorStreaming,
    isStreaming,
    messages,
    pendingMessage,
    selectedParticipants,
    setSelectedParticipants,
    waitingToStartStreaming,
  } = useChatStore(
    useShallow(s => ({
      inputValue: s.inputValue,
      isModeratorStreaming: s.isModeratorStreaming,
      isStreaming: s.isStreaming,
      messages: s.messages,
      pendingMessage: s.pendingMessage,
      selectedParticipants: s.selectedParticipants,
      setSelectedParticipants: s.setSelectedParticipants,
      waitingToStartStreaming: s.waitingToStartStreaming,
    })),
  );

  const { data: modelsData } = useModelsQuery();
  const allEnabledModels = useMemo(() => {
    if (!modelsData?.success || !modelsData.data?.items) {
      return [];
    }
    return modelsData.data.items;
  }, [modelsData]);

  // ✅ GRANULAR: Track vision (image) and file (document) incompatibilities separately
  const { fileIncompatibleModelIds, incompatibleModelIds, visionIncompatibleModelIds } = useMemo(() => {
    const incompatible = new Set<string>();

    // Add inaccessible models (tier restrictions)
    for (const model of allEnabledModels) {
      if (!model.is_accessible_to_user) {
        incompatible.add(model.id);
      }
    }

    // Check for images in thread and attachments
    const existingImageFiles = threadHasImageFiles(messages);
    const newImageFiles = chatAttachments.attachments.some(att =>
      isImageFile(att.file.type),
    );
    const hasImages = existingImageFiles || newImageFiles;

    // Check for documents in thread and attachments
    const existingDocumentFiles = threadHasDocumentFiles(messages);
    const newDocumentFiles = chatAttachments.attachments.some(att =>
      isDocumentFile(att.file.type),
    );
    const hasDocuments = existingDocumentFiles || newDocumentFiles;

    // Build file list for capability checking
    const files: { mimeType: string }[] = [];
    if (hasImages) {
      files.push({ mimeType: 'image/png' }); // Representative image type
    }
    if (hasDocuments) {
      files.push({ mimeType: 'application/pdf' }); // Representative document type
    }

    // Get detailed incompatibility info
    // Map models to the shape expected by getDetailedIncompatibleModelIds
    const modelsWithCapabilities = allEnabledModels.map((m: Model) => ({
      capabilities: {
        file: m.supports_file,
        vision: m.supports_vision,
      },
      id: m.id,
    }));
    const {
      fileIncompatibleIds,
      incompatibleIds,
      visionIncompatibleIds,
    } = getDetailedIncompatibleModelIds(modelsWithCapabilities, files);

    // Merge with tier-restricted models
    for (const id of incompatibleIds) {
      incompatible.add(id);
    }

    return {
      fileIncompatibleModelIds: fileIncompatibleIds,
      incompatibleModelIds: incompatible,
      visionIncompatibleModelIds: visionIncompatibleIds,
    };
  }, [messages, chatAttachments.attachments, allEnabledModels]);

  useEffect(() => {
    // Mark initial mount as complete after first run
    // This prevents showing toast on page load for pre-existing incompatible models
    const isInitialMount = !hasCompletedInitialMountRef.current;
    if (isInitialMount) {
      hasCompletedInitialMountRef.current = true;
    }

    if (incompatibleModelIds.size === 0) {
      return;
    }

    const incompatibleSelected = selectedParticipants.filter(
      p => incompatibleModelIds.has(p.modelId),
    );

    if (incompatibleSelected.length === 0) {
      return;
    }

    // ✅ GRANULAR: Track deselected models by reason
    const visionDeselected = incompatibleSelected.filter(
      p => visionIncompatibleModelIds.has(p.modelId),
    );
    const fileDeselected = incompatibleSelected.filter(
      p => fileIncompatibleModelIds.has(p.modelId) && !visionIncompatibleModelIds.has(p.modelId),
    );

    const visionModelNames = visionDeselected
      .map((p: ParticipantConfig) => allEnabledModels.find((m: Model) => m.id === p.modelId)?.name)
      .filter((name): name is string => Boolean(name));

    const fileModelNames = fileDeselected
      .map((p: ParticipantConfig) => allEnabledModels.find((m: Model) => m.id === p.modelId)?.name)
      .filter((name): name is string => Boolean(name));

    const compatibleParticipants = selectedParticipants.filter(
      p => !incompatibleModelIds.has(p.modelId),
    );

    const reindexed = compatibleParticipants.map((p, index) => ({
      ...p,
      priority: index,
    }));

    setSelectedParticipants(reindexed);
    setSelectedModelIds(reindexed.map(p => p.modelId));

    // ✅ GRANULAR TOASTS: Show specific reason for deselection (not on initial page load)
    if (!isInitialMount) {
      // Toast for vision (image) incompatibility
      if (visionModelNames.length > 0) {
        const modelList = visionModelNames.length <= 2
          ? visionModelNames.join(' and ')
          : `${visionModelNames.slice(0, 2).join(', ')} and ${visionModelNames.length - 2} more`;

        toastManager.warning(
          t('chat.models.modelsDeselected'),
          t('chat.models.modelsDeselectedDueToImages', { models: modelList }),
        );
      }

      // Toast for file (document) incompatibility - separate from vision
      if (fileModelNames.length > 0) {
        const modelList = fileModelNames.length <= 2
          ? fileModelNames.join(' and ')
          : `${fileModelNames.slice(0, 2).join(', ')} and ${fileModelNames.length - 2} more`;

        toastManager.warning(
          t('chat.models.modelsDeselected'),
          t('chat.models.modelsDeselectedDueToDocuments', { models: modelList }),
        );
      }
    }
  }, [incompatibleModelIds, visionIncompatibleModelIds, fileIncompatibleModelIds, selectedParticipants, setSelectedParticipants, setSelectedModelIds, allEnabledModels, t]);

  const formActions = useChatFormActions();

  // Check if waiting for moderator (no moderator message for current round)
  // Backend-first architecture: subscriptions will update UI when moderator streams
  const isAwaitingModerator = useMemo(() => {
    if (messages.length === 0 || participants.length === 0) {
      return false;
    }
    const currentRound = getCurrentRoundNumber(messages);
    const moderatorExists = getModeratorMessageForRound(messages, currentRound) !== undefined;
    return !moderatorExists;
  }, [messages, participants]);

  // ✅ MEMORY EVENTS: Poll for memory creation after moderator completes
  // Memory extraction runs in moderator.handler.ts after moderator stream finishes
  const previousModeratorCompleteRef = useRef<{ round: number; complete: boolean } | null>(null);

  useEffect(() => {
    // Only poll for project threads
    if (!thread.projectId) {
      return;
    }

    const currentRound = getCurrentRoundNumber(messages);
    if (currentRound === 0) {
      return;
    }

    // Check if moderator message exists and is complete for this round
    const moderatorMessage = getModeratorMessageForRound(messages, currentRound);
    const moderatorMeta = moderatorMessage ? getModeratorMetadata(moderatorMessage.metadata) : null;
    const hasFinishReason = moderatorMeta && isCompletionFinishReason(moderatorMeta.finishReason);
    const hasContent = moderatorMessage?.parts?.some(
      (p: { type: string; text?: string }) => p.type === 'text' && 'text' in p && typeof p.text === 'string' && p.text.trim().length > 0,
    ) ?? false;
    const moderatorComplete = Boolean(hasFinishReason || hasContent);

    // Check if moderator just completed (transition from incomplete to complete)
    const prevState = previousModeratorCompleteRef.current;
    const moderatorJustCompleted = moderatorComplete
      && prevState
      && prevState.round === currentRound
      && !prevState.complete;

    // Update ref for next check
    previousModeratorCompleteRef.current = { complete: moderatorComplete, round: currentRound };

    if (!moderatorJustCompleted) {
      return;
    }

    rlog.resume('memory-poll', `r${currentRound} moderator complete, polling for memory events`);

    // Poll for memory events after 3 seconds (allow extraction to complete in background)
    const timeout = setTimeout(async () => {
      try {
        const response = await getThreadMemoryEventsService({
          param: { threadId: thread.id },
          query: { roundNumber: currentRound },
        });

        if (response?.memories?.length) {
          // Store memory events for inline display under user messages
          type MemoryItem = NonNullable<GetThreadMemoryEventsResponse>['memories'][number];
          const memoryEvents: MemoryEvent[] = response.memories.map((m: MemoryItem) => ({
            content: m.content ?? m.summary,
            id: m.id,
            summary: m.summary,
          }));

          setMemoryEventsByRound((prev) => {
            const next = new Map(prev);
            next.set(currentRound, memoryEvents);
            return next;
          });

          rlog.resume('memory-poll', `r${currentRound} found ${response.memories.length} memories`);
        }
      } catch (error) {
        // Silent fail - memory events are non-critical
        console.error('[MemoryEvents] Failed to poll:', error);
      }
    }, 3000);

    return () => clearTimeout(timeout);
  }, [messages, thread.id, thread.projectId]);

  const isSubmitBlocked = isStreaming || isModeratorStreaming || Boolean(pendingMessage) || isAwaitingModerator || waitingToStartStreaming;

  const handlePromptSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!inputValue.trim() || selectedParticipants.length === 0 || isSubmitBlocked) {
        return;
      }

      if (!chatAttachments.allUploaded) {
        return;
      }

      const attachmentIds = chatAttachments.getUploadIds();
      const attachmentInfos = chatAttachments.attachments
        .filter(att => att.status === UploadStatuses.COMPLETED && att.uploadId)
        .map((att) => {
          if (!att.uploadId) {
            throw new Error('Upload ID is required for completed attachments');
          }
          return {
            filename: att.file.name,
            mimeType: att.file.type,
            previewUrl: att.preview?.url,
            uploadId: att.uploadId,
          };
        });
      await formActions.handleUpdateThreadAndSend(thread.id, attachmentIds, attachmentInfos);
      chatAttachments.clearAttachments();
    },
    [inputValue, selectedParticipants, formActions, thread.id, isSubmitBlocked, chatAttachments],
  );

  // Memory delete mutation
  const deleteMemoryMutation = useDeleteProjectMemoryMutation();

  // Handler to delete a memory and remove from local state
  const handleDeleteMemory = useCallback(
    async (memoryId: string, roundNumber: number) => {
      if (!thread.projectId) {
        return;
      }

      try {
        await deleteMemoryMutation.mutateAsync({
          param: { id: thread.projectId, memoryId },
        });

        // Remove from local state
        setMemoryEventsByRound((prev) => {
          const next = new Map(prev);
          const roundMemories = next.get(roundNumber);
          if (roundMemories) {
            const filtered = roundMemories.filter(m => m.id !== memoryId);
            if (filtered.length === 0) {
              next.delete(roundNumber);
            } else {
              next.set(roundNumber, filtered);
            }
          }
          return next;
        });

        rlog.resume('memory-delete', `deleted memory ${memoryId} from round ${roundNumber}`);
      } catch (error) {
        console.error('[MemoryDelete] Failed:', error);
        toastManager.error(t('chat.memory.deleteFailed'));
      }
    },
    [thread.projectId, deleteMemoryMutation, t],
  );

  return (
    <>
      <h1 className="sr-only">{thread.title || t('chat.thread.conversationTitle')}</h1>
      <ChatView
        user={user}
        slug={slug}
        mode="thread"
        onSubmit={handlePromptSubmit}
        chatAttachments={chatAttachments}
        threadId={thread.id}
        initialMessages={uiMessages}
        initialParticipants={participants}
        initialPreSearches={initialPreSearches}
        initialChangelog={initialChangelog}
        memoryEventsByRound={memoryEventsByRound}
        onDeleteMemory={handleDeleteMemory}
        skipEntranceAnimations={uiMessages.length > 0}
      />

      <ChatDeleteDialog
        isOpen={isDeleteDialogOpen.value}
        onOpenChange={isDeleteDialogOpen.setValue}
        threadId={thread.id}
        threadSlug={slug}
        projectId={thread.projectId ?? undefined}
        redirectIfCurrent
      />
    </>
  );
}
