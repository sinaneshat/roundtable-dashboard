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
 * 3. Enable analysis orchestrator (thread mode only, when enabled)
 *    └─> useAnalysisOrchestrator syncs server analyses to store
 * 4. Register analysis callbacks
 *    └─> Analysis triggering now handled by store subscriptions
 *
 * Location: /src/stores/chat/actions/screen-initialization.ts
 * Used by: ChatOverviewScreen, ChatThreadScreen
 */

'use client';

import type { UIMessage } from 'ai';
import { useEffect, useRef } from 'react';

import type { ScreenMode } from '@/api/core/enums';
import type { ChatParticipant, ChatThread } from '@/api/routes/chat/schema';
import { useChatStore } from '@/components/providers/chat-store-provider';
import type { ChatModeId } from '@/lib/config/chat-modes';

import { useAnalysisOrchestrator } from './analysis-orchestrator';
import { useIncompleteRoundResumption } from './incomplete-round-resumption';
import { usePreSearchOrchestrator } from './pre-search-orchestrator';

export type UseScreenInitializationOptions = {
  /**
   * Screen mode determines behavior:
   * - 'overview': Navigate after first round + analysis
   * - 'thread': Full interactivity, regeneration
   * - 'public': Read-only display
   */
  mode: ScreenMode;

  /**
   * Thread data (from server or created)
   */
  thread?: ChatThread | null;

  /**
   * Participants for the conversation
   */
  participants?: ChatParticipant[];

  /**
   * Initial messages (for SSR hydration)
   */
  initialMessages?: UIMessage[];

  /**
   * Chat mode for analysis
   */
  chatMode?: ChatModeId | null;

  /**
   * Regeneration state (thread mode only)
   */
  isRegeneration?: boolean;
  regeneratingRoundNumber?: number | null;

  /**
   * Analysis orchestrator enable flag (thread mode only)
   * Screens can control when orchestrator is enabled based on their state
   */
  enableOrchestrator?: boolean;
};

/**
 * Unified screen initialization hook
 *
 * Consolidates common initialization logic:
 * 1. Set screen mode in store
 * 2. Initialize thread (if provided)
 * 3. Set up analysis callbacks (for interactive modes)
 * 4. Enable analysis orchestration (for thread mode)
 *
 * @example
 * // Overview screen
 * useScreenInitialization({
 *   mode: 'overview',
 *   thread: createdThread,
 *   participants: selectedParticipants,
 *   chatMode: selectedMode,
 * });
 *
 * @example
 * // Thread screen
 * useScreenInitialization({
 *   mode: 'thread',
 *   thread: threadData,
 *   participants: threadParticipants,
 *   initialMessages: serverMessages,
 *   chatMode: threadData.mode,
 *   isRegeneration: regeneratingRoundNumber !== null,
 *   regeneratingRoundNumber,
 * });
 *
 * @example
 * // Public screen
 * useScreenInitialization({
 *   mode: 'public',
 *   thread: publicThread,
 *   participants: publicParticipants,
 *   initialMessages: publicMessages,
 *   chatMode: publicThread.mode,
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

  // Store actions
  const setScreenMode = useChatStore(s => s.setScreenMode);
  const initializeThread = useChatStore(s => s.initializeThread);

  // Set screen mode on mount
  useEffect(() => {
    setScreenMode(mode);
    return () => setScreenMode(null);
  }, [mode, setScreenMode]);

  // Initialize thread ONLY ONCE per mount
  // CRITICAL: After initialization, messages flow ONLY from AI SDK → Provider sync
  // Never re-initialize with stale initialMessages - causes duplicate messages
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (!hasInitialized.current && thread && participants.length > 0) {
      hasInitialized.current = true;
      // Initialize thread with participants and messages
      // Pre-search data is fetched by PreSearchCard component via TanStack Query
      initializeThread(thread, participants, initialMessages);
    }
    // Empty deps = run once on mount, never on re-renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset flag on unmount/thread change to allow re-initialization on next mount
  useEffect(() => {
    return () => {
      hasInitialized.current = false;
    };
  }, [thread?.id]);

  // ============================================================================
  // ANALYSIS ORCHESTRATION (Thread & Overview modes)
  // ============================================================================
  // ✅ FIX: Enable orchestrator on overview screen when thread is created
  // The orchestrator fetches analyses from server, which triggers backend cleanup
  // of orphaned/stuck analyses. Without this, stuck 'streaming' analyses never recover.
  // Overview mode needs this for first round analysis, thread mode needs it for all rounds.

  const shouldEnableOrchestrator = Boolean(thread?.id) && enableOrchestrator;

  // Get regeneratingRoundNumber from store for deduplication
  const regeneratingRoundNumber = useChatStore(s => s.regeneratingRoundNumber);

  useAnalysisOrchestrator({
    threadId: thread?.id || '',
    enabled: shouldEnableOrchestrator,
    deduplicationOptions: { regeneratingRoundNumber },
  });

  // ============================================================================
  // PRE-SEARCH ORCHESTRATION (All modes when web search enabled)
  // ============================================================================
  // ✅ CRITICAL FIX: Enable orchestrator in overview mode to sync backend's pre-search record
  // Backend creates PENDING pre-search during thread creation (thread.handler.ts:265-274)
  // Frontend needs orchestrator to sync this record from server
  // PreSearchStream depends on having the synced pre-search record to execute API call
  //
  // FLOW:
  // 1. Backend creates PENDING pre-search with real ID
  // 2. Orchestrator syncs it to store
  // 3. PreSearchStream detects PENDING status and executes SSE streaming
  // 4. Results update database and orchestrator re-syncs
  //
  // Previously disabled in overview mode, causing race conditions and canceled API calls

  const shouldEnablePreSearchOrchestrator
    = Boolean(thread?.id)
      && Boolean(thread?.enableWebSearch)
      && enableOrchestrator; // Respect parent's orchestrator control

  usePreSearchOrchestrator({
    threadId: thread?.id || '',
    enabled: shouldEnablePreSearchOrchestrator,
  });

  // ============================================================================
  // ANALYSIS CALLBACKS (Overview & Thread modes)
  // ============================================================================
  // Analysis creation now handled automatically by store subscription

  // ============================================================================
  // INCOMPLETE ROUND RESUMPTION (Thread mode only)
  // ============================================================================
  // ✅ CRITICAL FIX: Resume incomplete rounds on page load
  // When a user navigates away during participant streaming and returns later:
  // - Some participants may have responded, others may not
  // - This hook detects incomplete rounds and triggers remaining participants
  // - Only enabled for thread mode (overview creates new threads)

  const isStreaming = useChatStore(s => s.isStreaming);

  useIncompleteRoundResumption({
    threadId: thread?.id || '',
    enabled: mode === 'thread' && Boolean(thread?.id) && !isStreaming && enableOrchestrator,
  });
}
