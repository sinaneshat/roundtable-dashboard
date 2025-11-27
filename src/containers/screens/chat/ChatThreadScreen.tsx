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

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { AnalysisStatuses } from '@/api/core/enums';
import type { ChatMessage, ChatParticipant, ChatThread } from '@/api/routes/chat/schema';
import { ChatDeleteDialog } from '@/components/chat/chat-delete-dialog';
import { ChatThreadActions } from '@/components/chat/chat-thread-actions';
import { useThreadHeader } from '@/components/chat/thread-header-context';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { useBoolean } from '@/hooks/utils';
import type { ChatModeId } from '@/lib/config/chat-modes';
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

  const { resetThreadState, setShowInitialUI, setHasInitiallyLoaded, setSelectedMode, setEnableWebSearch } = useChatStore(
    useShallow(s => ({
      resetThreadState: s.resetThreadState,
      setShowInitialUI: s.setShowInitialUI,
      setHasInitiallyLoaded: s.setHasInitiallyLoaded,
      setSelectedMode: s.setSelectedMode,
      setEnableWebSearch: s.setEnableWebSearch,
    })),
  );

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
    chatMode: selectedMode || (thread.mode as ChatModeId),
    isRegeneration: regeneratingRoundNumber !== null,
    regeneratingRoundNumber,
    enableOrchestrator: !isRegenerating && !hasStreamingAnalysis,
  });

  // Input blocking for submit guard only (ChatView handles its own input state)
  const isSubmitBlocked = isStreaming || isCreatingAnalysis || Boolean(pendingMessage);

  // ============================================================================
  // REFS & EFFECTS
  // ============================================================================

  const isInitialMount = useRef(true);
  const lastSyncedEnableWebSearchRef = useRef<boolean | undefined>(undefined);

  // Initialize thread on mount and when thread ID changes
  useEffect(() => {
    if (!isInitialMount.current) {
      resetThreadState();
    }
    isInitialMount.current = false;

    if (thread?.mode) {
      setSelectedMode(thread.mode as ChatModeId);
    }

    const threadEnableWebSearch = thread.enableWebSearch || false;
    setEnableWebSearch(threadEnableWebSearch);
    lastSyncedEnableWebSearchRef.current = threadEnableWebSearch;

    setShowInitialUI(false);
    setHasInitiallyLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

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

      await formActions.handleUpdateThreadAndSend(thread.id);
    },
    [inputValue, selectedParticipants, formActions, thread.id, isSubmitBlocked],
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
