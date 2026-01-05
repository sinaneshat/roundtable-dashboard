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
 * 3. Enable moderator orchestrator (thread mode only, when enabled)
 * 4. Register moderator callbacks (handled by store subscriptions)
 */

'use client';

import type { UIMessage } from 'ai';
import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { ChatMode, ScreenMode } from '@/api/core/enums';
import { ScreenModes } from '@/api/core/enums';
import type { ChatParticipant, ChatThread } from '@/api/routes/chat/schema';
import { useChatStore } from '@/components/providers';

import { useIncompleteRoundResumption } from './incomplete-round-resumption';
import { usePreSearchOrchestrator } from './pre-search-orchestrator';

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
  /** Moderator orchestrator enable flag */
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

  // ✅ NON-INITIAL ROUND FIX: Check specific flags to detect active form submission
  // - pendingMessage: Set by form-actions prepareForNewMessage() in overview flow
  // - streamResumptionPrefilled: Set by prefill effect when server detected incomplete round
  // - configChangeRoundNumber: Set by handleUpdateThreadAndSend BEFORE PATCH (KEY indicator)
  // - isWaitingForChangelog: Set AFTER PATCH (always set, cleared by use-changelog-sync)
  //
  // CRITICAL: handleUpdateThreadAndSend does NOT set pendingMessage, so we must check
  // configChangeRoundNumber and isWaitingForChangelog to detect active form submissions.
  // These are the definitive indicators - they're only set during active submission and
  // cleared after completion. Without this check, when PATCH response updates
  // thread/participants, initializeThread gets called and resets streaming state.
  //
  // NOTE: waitingToStartStreaming is NOT used because it could be stale state from
  // a previous session. configChangeRoundNumber/isWaitingForChangelog are reliable.
  const streamingStateSet = useChatStore(useShallow(s => ({
    pendingMessage: s.pendingMessage,
    streamResumptionPrefilled: s.streamResumptionPrefilled,
    configChangeRoundNumber: s.configChangeRoundNumber,
    isWaitingForChangelog: s.isWaitingForChangelog,
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

    // ✅ FIX: Skip for active form-actions submission, NOT for resumption
    //
    // Detection logic for ACTIVE FORM SUBMISSION:
    // 1. pendingMessage !== null (set by prepareForNewMessage in overview flow)
    // 2. configChangeRoundNumber !== null (set by handleUpdateThreadAndSend before PATCH)
    //    This is the KEY indicator - it's only set during active form submission
    // 3. isWaitingForChangelog (set after PATCH, always set, cleared by use-changelog-sync)
    //
    // NOTE: waitingToStartStreaming alone is NOT sufficient because it could be stale
    // state from a previous session. configChangeRoundNumber and isWaitingForChangelog
    // are only set during active form submissions and cleared after completion.
    //
    // handleUpdateThreadAndSend does NOT set pendingMessage, so we must check
    // configChangeRoundNumber and isWaitingForChangelog instead. Without this check,
    // when PATCH response updates thread/participants, this effect would call
    // initializeThread which resets all streaming state and breaks placeholders.
    //
    // RESUMPTION detection:
    // - streamResumptionPrefilled: Set by prefill effect when server detected incomplete round
    // - If prefill ran, the streaming setup is for resumption, not form submission
    const isResumption = streamingStateSet.streamResumptionPrefilled;
    const hasActiveFormSubmission
      = streamingStateSet.configChangeRoundNumber !== null
        || streamingStateSet.isWaitingForChangelog;

    // Active form submission = has specific submission flags AND is not resumption
    // OR has pendingMessage (from overview flow prepareForNewMessage)
    const isFormActionsSubmission
      = (streamingStateSet.pendingMessage !== null || hasActiveFormSubmission)
        && !isResumption;

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

  // ✅ TEXT STREAMING: Moderator messages are now in chatMessage table
  // No separate orchestrator needed - loaded with messages automatically

  // ✅ BUG FIX: Always enable pre-search orchestrator regardless of current enableWebSearch
  // Pre-searches may exist from earlier rounds when web search was enabled
  // The orchestrator returns empty array if no pre-searches exist, which is fine
  // Previously only enabled when thread.enableWebSearch=true, causing historical
  // pre-search data to disappear after refresh when web search was later disabled
  // ✅ PERF FIX: Only fetch in THREAD mode - overview doesn't need pre-searches for new threads
  const preSearchOrchestratorEnabled = mode === ScreenModes.THREAD && Boolean(thread?.id) && enableOrchestrator;
  usePreSearchOrchestrator({
    threadId: thread?.id || '',
    enabled: preSearchOrchestratorEnabled,
  });

  // Selector for incomplete round resumption (uses useShallow for consistency)
  const { isStreaming } = useChatStore(useShallow(s => ({
    isStreaming: s.isStreaming,
  })));

  useIncompleteRoundResumption({
    threadId: thread?.id || '',
    enabled: mode === ScreenModes.THREAD && Boolean(thread?.id) && !isStreaming && enableOrchestrator,
  });
}
