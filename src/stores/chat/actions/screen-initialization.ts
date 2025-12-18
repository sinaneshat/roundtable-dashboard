/**
 * Unified Screen Initialization
 *
 * Consolidates initialization logic shared across:
 * - ChatOverviewScreen (mode: 'overview')
 * - ChatThreadScreen (mode: 'thread')
 * - PublicChatThreadScreen (mode: 'public')
 *
 * PATTERN:
 * - Single initialization hook for all screen modes
 * - Screen-specific behavior via mode parameter
 * - Reduces duplication across screen implementations
 *
 * INITIALIZATION FLOW:
 * 1. Set screen mode in store (for global access)
 * 2. Initialize thread with participants and messages (if provided)
 * 3. Enable summary orchestrator (thread mode only, when enabled)
 * 4. Register summary callbacks (handled by store subscriptions)
 */

'use client';

import type { UIMessage } from 'ai';
import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { ChatMode, ScreenMode } from '@/api/core/enums';
import { ScreenModes } from '@/api/core/enums';
import type { ChatParticipant, ChatThread } from '@/api/routes/chat/schema';
import { useChatStore } from '@/components/providers/chat-store-provider';

import { useIncompleteRoundResumption } from './incomplete-round-resumption';
import { usePreSearchOrchestrator } from './pre-search-orchestrator';
import { useSummaryOrchestrator } from './summary-orchestrator';

export type UseScreenInitializationOptions = {
  /** Screen mode: 'overview', 'thread', or 'public' */
  mode: ScreenMode;
  /** Thread data (from server or created) */
  thread?: ChatThread | null;
  /** Participants for the conversation */
  participants?: ChatParticipant[];
  /** Initial messages (for SSR hydration) */
  initialMessages?: UIMessage[];
  /** Chat mode */
  chatMode?: ChatMode | null;
  /** Regeneration state (thread mode only) */
  isRegeneration?: boolean;
  regeneratingRoundNumber?: number | null;
  /** Summary orchestrator enable flag */
  enableOrchestrator?: boolean;
};

/**
 * Unified screen initialization hook
 *
 * @example
 * useScreenInitialization({
 *   mode: 'thread',
 *   thread: threadData,
 *   participants: threadParticipants,
 *   initialMessages: serverMessages,
 * });
 */
export function useScreenInitialization(options: UseScreenInitializationOptions) {
  const {
    mode,
    thread,
    participants = [],
    initialMessages,
    enableOrchestrator = true,
  } = options;

  // Store actions - batched with useShallow for stable reference
  const actions = useChatStore(useShallow(s => ({
    setScreenMode: s.setScreenMode,
    initializeThread: s.initializeThread,
  })));

  // ✅ NON-INITIAL ROUND FIX: Check pendingMessage AND streamResumptionPrefilled
  // - pendingMessage: Set by form-actions prepareForNewMessage(), also persisted by Zustand
  // - streamResumptionPrefilled: Set by prefill effect AFTER render
  //
  // CRITICAL: Include streamResumptionPrefilled in selector so effect re-runs when prefill
  // completes. Otherwise, the effect sees stale pendingMessage from persist and thinks
  // it's an active form submission when it's actually resumption.
  const streamingStateSet = useChatStore(useShallow(s => ({
    pendingMessage: s.pendingMessage,
    streamResumptionPrefilled: s.streamResumptionPrefilled,
  })));

  // Track which thread we've initialized to prevent duplicate calls
  const initializedThreadIdRef = useRef<string | null>(null);

  // Set screen mode on mount/change
  useEffect(() => {
    actions.setScreenMode(mode);
    return () => actions.setScreenMode(null);
  }, [mode, actions]);

  // Initialize thread when data is ready
  // Simple ref guard - no custom hook needed
  useEffect(() => {
    const threadId = thread?.id;
    const isReady = threadId && participants.length > 0;
    const alreadyInitialized = initializedThreadIdRef.current === threadId;

    // ✅ FIX: Skip ONLY for active form-actions submission, NOT for resumption
    //
    // Detection logic:
    // - pendingMessage !== null: Could be active submission OR stale from Zustand persist
    // - streamResumptionPrefilled: Set by prefill effect when this is a resumption
    //
    // If pendingMessage is set BUT prefill also ran, this is resumption (pendingMessage
    // is stale from persist). If pendingMessage is set AND prefill hasn't run, this is
    // an active form submission.
    //
    // CRITICAL: This effect re-runs when streamResumptionPrefilled changes (it's in the
    // selector), so even if first run incorrectly detects form submission, the second
    // run after prefill will correctly detect resumption and call initializeThread.
    const isFormActionsSubmission = streamingStateSet.pendingMessage !== null
      && !streamingStateSet.streamResumptionPrefilled;

    if (isReady && !alreadyInitialized && !isFormActionsSubmission) {
      initializedThreadIdRef.current = threadId;
      actions.initializeThread(thread, participants, initialMessages);
    }

    // ✅ NON-INITIAL ROUND FIX: Only mark as initialized when we actually called initializeThread
    // or when there's an active form-actions submission.
    // Previously, stale waitingToStartStreaming from persist would incorrectly mark as initialized,
    // preventing initializeThread from ever being called even on re-renders.

    // Reset tracking when threadId changes (allows re-init on navigation)
    if (threadId !== initializedThreadIdRef.current && initializedThreadIdRef.current !== null) {
      initializedThreadIdRef.current = null;
    }
  }, [thread, participants, initialMessages, actions, streamingStateSet]);

  // ============================================================================
  // ORCHESTRATION HOOKS
  // ============================================================================

  const shouldEnableOrchestrator = Boolean(thread?.id) && enableOrchestrator;
  const regeneratingRoundNumber = useChatStore(s => s.regeneratingRoundNumber);

  useSummaryOrchestrator({
    threadId: thread?.id || '',
    enabled: shouldEnableOrchestrator,
    deduplicationOptions: { regeneratingRoundNumber },
  });

  // ✅ BUG FIX: Always enable pre-search orchestrator regardless of current enableWebSearch
  // Pre-searches may exist from earlier rounds when web search was enabled
  // The orchestrator returns empty array if no pre-searches exist, which is fine
  // Previously only enabled when thread.enableWebSearch=true, causing historical
  // pre-search data to disappear after refresh when web search was later disabled
  const preSearchOrchestratorEnabled = Boolean(thread?.id) && enableOrchestrator;
  usePreSearchOrchestrator({
    threadId: thread?.id || '',
    enabled: preSearchOrchestratorEnabled,
  });

  const isStreaming = useChatStore(s => s.isStreaming);

  useIncompleteRoundResumption({
    threadId: thread?.id || '',
    enabled: mode === ScreenModes.THREAD && Boolean(thread?.id) && !isStreaming && enableOrchestrator,
  });
}
