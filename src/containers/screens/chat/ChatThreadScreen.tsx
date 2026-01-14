'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { ChatModeSchema, UploadStatuses } from '@/api/core/enums';
import type { ChatMessage, ChatThread, ThreadStreamResumptionState } from '@/api/routes/chat/schema';
import { ChatThreadActions } from '@/components/chat/chat-thread-actions';
import { useThreadHeader } from '@/components/chat/thread-header-context';
import { useChatStore, useModelPreferencesStore } from '@/components/providers';
import { useModelsQuery } from '@/hooks/queries';
import { useBoolean, useChatAttachments } from '@/hooks/utils';
import type { ChatParticipantWithSettings } from '@/lib/schemas/participant-schemas';
import { toastManager } from '@/lib/toast';
import {
  chatMessagesToUIMessages,
  getCurrentRoundNumber,
  getIncompatibleModelIds,
  isVisionRequiredMimeType,
  threadHasVisionRequiredFiles,
} from '@/lib/utils';
import {
  areAllParticipantsCompleteForRound,
  getModeratorMessageForRound,
  useChatFormActions,
  useScreenInitialization,
} from '@/stores/chat';

import { ChatView } from './ChatView';

const ChatDeleteDialog = dynamic(
  () => import('@/components/chat/chat-delete-dialog').then(m => m.ChatDeleteDialog),
  { ssr: false },
);

type ChatThreadScreenProps = {
  thread: ChatThread;
  participants: ChatParticipantWithSettings[];
  initialMessages: ChatMessage[];
  slug: string;
  user: {
    name: string;
    image: string | null;
  };
  /** Stream resumption state from server-side KV check (for Zustand pre-fill) */
  streamResumptionState?: ThreadStreamResumptionState | null;
};

function useThreadHeaderUpdater({
  thread,
  slug,
  onDeleteClick,
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
  thread,
  participants,
  initialMessages,
  slug,
  user,
  streamResumptionState,
}: ChatThreadScreenProps) {
  const t = useTranslations();
  const isDeleteDialogOpen = useBoolean(false);
  const chatAttachments = useChatAttachments();

  useThreadHeaderUpdater({ thread, slug, onDeleteClick: isDeleteDialogOpen.onTrue });

  const { setSelectedModelIds } = useModelPreferencesStore(useShallow(s => ({
    setSelectedModelIds: s.setSelectedModelIds,
  })));

  const {
    isStreaming,
    isModeratorStreaming,
    pendingMessage,
    selectedMode,
    inputValue,
    selectedParticipants,
    messages,
    setSelectedParticipants,
    waitingToStartStreaming,
  } = useChatStore(
    useShallow(s => ({
      isStreaming: s.isStreaming,
      isModeratorStreaming: s.isModeratorStreaming,
      pendingMessage: s.pendingMessage,
      selectedMode: s.selectedMode,
      inputValue: s.inputValue,
      selectedParticipants: s.selectedParticipants,
      messages: s.messages,
      setSelectedParticipants: s.setSelectedParticipants,
      waitingToStartStreaming: s.waitingToStartStreaming,
    })),
  );

  // ✅ MOVED: prefillStreamResumptionState is now called synchronously in useScreenInitialization
  // to fix the timing race where initializeThread read streamResumptionPrefilled=false

  const uiMessages = useMemo(
    () => chatMessagesToUIMessages(initialMessages, participants),
    [initialMessages, participants],
  );

  const { data: modelsData } = useModelsQuery();
  const allEnabledModels = useMemo(
    () => modelsData?.data?.items || [],
    [modelsData?.data?.items],
  );

  const { incompatibleModelIds, visionIncompatibleModelIds } = useMemo(() => {
    const incompatible = new Set<string>();
    const visionIncompatible = new Set<string>();

    for (const model of allEnabledModels) {
      if (!model.is_accessible_to_user) {
        incompatible.add(model.id);
      }
    }

    const existingVisionFiles = threadHasVisionRequiredFiles(messages);
    const newVisionFiles = chatAttachments.attachments.some(att =>
      isVisionRequiredMimeType(att.file.type),
    );

    if (existingVisionFiles || newVisionFiles) {
      const files = [{ mimeType: 'image/png' }];
      const visionIncompatibleIds = getIncompatibleModelIds(allEnabledModels, files);
      for (const id of visionIncompatibleIds) {
        incompatible.add(id);
        visionIncompatible.add(id);
      }
    }

    return { incompatibleModelIds: incompatible, visionIncompatibleModelIds: visionIncompatible };
  }, [messages, chatAttachments.attachments, allEnabledModels]);

  useEffect(() => {
    if (incompatibleModelIds.size === 0)
      return;

    const incompatibleSelected = selectedParticipants.filter(
      p => incompatibleModelIds.has(p.modelId),
    );

    if (incompatibleSelected.length === 0)
      return;

    // Only show toast for models deselected due to vision incompatibility (not access control)
    const visionDeselected = incompatibleSelected.filter(
      p => visionIncompatibleModelIds.has(p.modelId),
    );

    const visionModelNames = visionDeselected
      .map(p => allEnabledModels.find(m => m.id === p.modelId)?.name)
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

    // Only show "images/PDFs" toast when models are actually deselected due to vision incompatibility
    if (visionModelNames.length > 0) {
      const modelList = visionModelNames.length <= 2
        ? visionModelNames.join(' and ')
        : `${visionModelNames.slice(0, 2).join(', ')} and ${visionModelNames.length - 2} more`;

      toastManager.warning(
        t('chat.models.modelsDeselected'),
        t('chat.models.modelsDeselectedDescription', { models: modelList }),
      );
    }
  }, [incompatibleModelIds, visionIncompatibleModelIds, selectedParticipants, setSelectedParticipants, setSelectedModelIds, allEnabledModels, t]);

  const formActions = useChatFormActions();

  const { isRegenerating, regeneratingRoundNumber } = useChatStore(
    useShallow(s => ({
      isRegenerating: s.isRegenerating,
      regeneratingRoundNumber: s.regeneratingRoundNumber,
    })),
  );

  const chatMode = useMemo(() => {
    if (selectedMode)
      return selectedMode;
    const parsed = ChatModeSchema.safeParse(thread.mode);
    return parsed.success ? parsed.data : undefined;
  }, [selectedMode, thread.mode]);

  useScreenInitialization({
    mode: 'thread',
    thread,
    participants,
    initialMessages: uiMessages,
    chatMode,
    isRegeneration: regeneratingRoundNumber !== null,
    regeneratingRoundNumber,
    enableOrchestrator: !isRegenerating && !isModeratorStreaming,
    streamResumptionState,
  });

  const isAwaitingModerator = useMemo(() => {
    if (messages.length === 0 || participants.length === 0)
      return false;

    const currentRound = getCurrentRoundNumber(messages);
    const allParticipantsComplete = areAllParticipantsCompleteForRound(messages, participants, currentRound);
    const moderatorExists = getModeratorMessageForRound(messages, currentRound) !== undefined;
    return allParticipantsComplete && !moderatorExists;
  }, [messages, participants]);

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
        .map(att => ({
          uploadId: att.uploadId!,
          filename: att.file.name,
          mimeType: att.file.type,
          previewUrl: att.preview?.url,
        }));
      await formActions.handleUpdateThreadAndSend(thread.id, attachmentIds, attachmentInfos);
      chatAttachments.clearAttachments();
    },
    [inputValue, selectedParticipants, formActions, thread.id, isSubmitBlocked, chatAttachments],
  );

  return (
    <>
      <ChatView
        user={user}
        slug={slug}
        mode="thread"
        onSubmit={handlePromptSubmit}
        chatAttachments={chatAttachments}
        threadId={thread.id}
      />

      <ChatDeleteDialog
        isOpen={isDeleteDialogOpen.value}
        onOpenChange={isDeleteDialogOpen.setValue}
        threadId={thread.id}
        threadSlug={slug}
        redirectIfCurrent={true}
      />
    </>
  );
}
