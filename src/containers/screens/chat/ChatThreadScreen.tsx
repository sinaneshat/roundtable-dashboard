'use client';

/**
 * ChatThreadScreen - Thread Detail Page
 *
 * Receives thread data from server props, initializes the store, and delegates
 * all rendering to ChatView for consistent behavior with the overview screen.
 *
 * ARCHITECTURE:
 * - Server data initialization via useScreenInitialization
 * - Store sync from SSR props
 * - Delete dialog (thread-specific action)
 * - ChatView handles all content rendering (same as overview screen)
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { ChatMode } from '@/api/core/enums';
import { AnalysisStatuses } from '@/api/core/enums';
import type { ChatMessage, ChatParticipant, ChatThread } from '@/api/routes/chat/schema';
import { ChatDeleteDialog } from '@/components/chat/chat-delete-dialog';
import { ChatThreadActions } from '@/components/chat/chat-thread-actions';
import { useThreadHeader } from '@/components/chat/thread-header-context';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { useBoolean, useChatAttachments } from '@/hooks/utils';
import { chatMessagesToUIMessages } from '@/lib/utils/message-transforms';
import {
  useChatFormActions,
  useScreenInitialization,
} from '@/stores/chat';

import { ChatView } from './ChatView';

type ChatThreadScreenProps = {
  thread: ChatThread;
  participants: ChatParticipant[];
  initialMessages: ChatMessage[];
  slug: string;
  user: {
    name: string;
    image: string | null;
  };
};

/**
 * Memoized thread header updater to prevent infinite render loops
 */
function useThreadHeaderUpdater({
  thread,
  slug,
  onDeleteClick,
}: {
  thread: ChatThread;
  slug: string;
  onDeleteClick: () => void;
}) {
  const { setThreadActions, setThreadTitle } = useThreadHeader();
  const threadId = thread.id;
  const threadTitle = thread.title;
  const isPublic = thread.isPublic;

  const threadActions = useMemo(
    () => (
      <ChatThreadActions
        thread={thread}
        slug={slug}
        onDeleteClick={onDeleteClick}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [threadId, threadTitle, isPublic, slug, onDeleteClick],
  );

  useEffect(() => {
    setThreadTitle(threadTitle);
    setThreadActions(threadActions);
  }, [threadTitle, threadActions, setThreadTitle, setThreadActions]);
}

export default function ChatThreadScreen({
  thread,
  participants,
  initialMessages,
  slug,
  user,
}: ChatThreadScreenProps) {
  // Delete dialog
  const isDeleteDialogOpen = useBoolean(false);

  // Chat attachments
  const chatAttachments = useChatAttachments();

  // Thread header
  useThreadHeaderUpdater({
    thread,
    slug,
    onDeleteClick: isDeleteDialogOpen.onTrue,
  });

  // ============================================================================
  // STORE STATE
  // ============================================================================

  const { isStreaming, isCreatingAnalysis, pendingMessage } = useChatStore(
    useShallow(s => ({
      isStreaming: s.isStreaming,
      isCreatingAnalysis: s.isCreatingAnalysis,
      pendingMessage: s.pendingMessage,
    })),
  );

  const analyses = useChatStore(s => s.analyses);
  const selectedMode = useChatStore(s => s.selectedMode);
  const inputValue = useChatStore(s => s.inputValue);
  const selectedParticipants = useChatStore(s => s.selectedParticipants);

  // ✅ SIMPLIFIED: initializeThread now handles all state setup
  // Removed: resetThreadState, setShowInitialUI, setHasInitiallyLoaded, setSelectedMode, setEnableWebSearch

  // ============================================================================
  // MEMOIZED DATA
  // ============================================================================

  // Transform initial messages once
  const uiMessages = useMemo(
    () => chatMessagesToUIMessages(initialMessages, participants),
    [initialMessages, participants],
  );

  // ============================================================================
  // HOOKS
  // ============================================================================

  const formActions = useChatFormActions();

  // Screen initialization
  const hasStreamingAnalysis = analyses.some(
    a => a.status === AnalysisStatuses.PENDING || a.status === AnalysisStatuses.STREAMING,
  );

  // ✅ FIX: Select individual values instead of nested object to avoid infinite loop
  // useShallow only does shallow comparison - nested objects create new references each time
  const isRegenerating = useChatStore(s => s.isRegenerating);
  const regeneratingRoundNumber = useChatStore(s => s.regeneratingRoundNumber);

  useScreenInitialization({
    mode: 'thread',
    thread,
    participants,
    initialMessages: uiMessages,
    chatMode: selectedMode || (thread.mode as ChatMode),
    isRegeneration: regeneratingRoundNumber !== null,
    regeneratingRoundNumber,
    enableOrchestrator: !isRegenerating && !hasStreamingAnalysis,
  });

  // Input blocking for submit guard only (ChatView handles its own input state)
  const isSubmitBlocked = isStreaming || isCreatingAnalysis || Boolean(pendingMessage);

  // ✅ SIMPLIFIED: Removed duplicate initialization useEffect
  // All state setup now happens in initializeThread (called by useScreenInitialization)

  // ============================================================================
  // CALLBACKS
  // ============================================================================

  const handlePromptSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Guard: prevent double submission
      if (!inputValue.trim() || selectedParticipants.length === 0 || isSubmitBlocked) {
        return;
      }

      // Wait for all uploads to complete before sending
      if (!chatAttachments.allUploaded) {
        return;
      }

      const attachmentIds = chatAttachments.getUploadIds();
      // Build attachment info for optimistic message file parts
      const attachmentInfos = chatAttachments.attachments
        .filter(att => att.status === 'completed' && att.uploadId)
        .map(att => ({
          uploadId: att.uploadId!,
          filename: att.file.name,
          mimeType: att.file.type,
          previewUrl: att.preview?.url,
        }));
      await formActions.handleUpdateThreadAndSend(thread.id, attachmentIds, attachmentInfos);
      // ✅ Clear store attachments is called inside handleUpdateThreadAndSend
      // ✅ Clear hook local state AFTER message is sent (keeps UI consistent with overview)
      chatAttachments.clearAttachments();
    },
    [inputValue, selectedParticipants, formActions, thread.id, isSubmitBlocked, chatAttachments],
  );

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <>
      <ChatView
        user={user}
        slug={slug}
        mode="thread"
        onSubmit={handlePromptSubmit}
        chatAttachments={chatAttachments}
      />

      <ChatDeleteDialog
        isOpen={isDeleteDialogOpen.value}
        onOpenChange={isDeleteDialogOpen.setValue}
        threadId={thread.id}
        threadSlug={slug}
      />
    </>
  );
}
