/**
 * Unified screen initialization
 */

'use client';

import type { UIMessage } from 'ai';
import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { ChatMode, ScreenMode } from '@/api/core/enums';
import { ScreenModes } from '@/api/core/enums';
import type { ChatParticipant, ChatThread } from '@/api/routes/chat/schema';
import { useChatStore } from '@/components/providers/chat-store-provider/context';

import { useIncompleteRoundResumption } from './incomplete-round-resumption';
import { getPreSearchOrchestrator } from './pre-search-orchestrator';

export type UseScreenInitializationOptions = {
  mode: ScreenMode;
  thread?: ChatThread | null;
  participants?: ChatParticipant[];
  initialMessages?: UIMessage[];
  chatMode?: ChatMode | null;
  isRegeneration?: boolean;
  regeneratingRoundNumber?: number | null;
  enableOrchestrator?: boolean;
};

export function useScreenInitialization(options: UseScreenInitializationOptions) {
  const {
    mode,
    thread,
    participants = [],
    initialMessages,
    enableOrchestrator = true,
  } = options;

  const actions = useChatStore(useShallow(s => ({
    setScreenMode: s.setScreenMode,
    initializeThread: s.initializeThread,
  })));

  const streamingStateSet = useChatStore(useShallow(s => ({
    pendingMessage: s.pendingMessage,
    streamResumptionPrefilled: s.streamResumptionPrefilled,
    configChangeRoundNumber: s.configChangeRoundNumber,
    isWaitingForChangelog: s.isWaitingForChangelog,
  })));

  const initializedThreadIdRef = useRef<string | null>(null);

  useEffect(() => {
    actions.setScreenMode(mode);
    return () => actions.setScreenMode(null);
  }, [mode, actions]);

  useEffect(() => {
    const threadId = thread?.id;
    const isReady = threadId && participants.length > 0;
    const alreadyInitialized = initializedThreadIdRef.current === threadId;

    const isResumption = streamingStateSet.streamResumptionPrefilled;
    const hasActiveFormSubmission
      = streamingStateSet.configChangeRoundNumber !== null
        || streamingStateSet.isWaitingForChangelog;

    const isFormActionsSubmission
      = (streamingStateSet.pendingMessage !== null || hasActiveFormSubmission)
        && !isResumption;

    if (isReady && !alreadyInitialized && !isFormActionsSubmission) {
      initializedThreadIdRef.current = threadId;
      actions.initializeThread(thread, participants, initialMessages);
    }

    if (threadId !== initializedThreadIdRef.current && initializedThreadIdRef.current !== null) {
      initializedThreadIdRef.current = null;
    }
  }, [thread, participants, initialMessages, actions, streamingStateSet]);

  const preSearchOrchestratorEnabled = mode === ScreenModes.THREAD && Boolean(thread?.id) && enableOrchestrator;
  getPreSearchOrchestrator({
    threadId: thread?.id || '',
    enabled: preSearchOrchestratorEnabled,
  });

  const { isStreaming } = useChatStore(useShallow(s => ({
    isStreaming: s.isStreaming,
  })));

  useIncompleteRoundResumption({
    threadId: thread?.id || '',
    enabled: mode === ScreenModes.THREAD && Boolean(thread?.id) && !isStreaming && enableOrchestrator,
  });
}
