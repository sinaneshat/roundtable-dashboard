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
 * 4. Register analysis callbacks via useChatInitialization
 *    └─> useChatInitialization creates stable callback wrapper
 *        └─> useAnalysisCreation handles analysis lifecycle
 *            └─> Calls createPendingAnalysis when all participants finish
 *
 * Location: /src/stores/chat/actions/screen-initialization.ts
 * Used by: ChatOverviewScreen, ChatThreadScreen
 */

'use client';

import type { UIMessage } from 'ai';
import { useEffect } from 'react';

import { DEFAULT_CHAT_MODE } from '@/api/core/enums';
import type { ChatParticipant, ChatThread } from '@/api/routes/chat/schema';
import { useChatStore } from '@/components/providers/chat-store-provider';
import type { ChatModeId } from '@/lib/config/chat-modes';

import { useAnalysisOrchestrator } from './analysis-orchestrator';
import { useChatInitialization } from './chat-initialization';

export type ScreenMode = 'overview' | 'thread' | 'public';

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

  /**
   * Callbacks for screen-specific logic
   */
  onBeforeAnalysisCreate?: (roundNumber: number) => void;
  onAfterAnalysisCreate?: (roundNumber: number) => void;
  onAllParticipantsFailed?: (roundNumber: number) => void;
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
    chatMode,
    isRegeneration = false,
    regeneratingRoundNumber = null,
    enableOrchestrator = true,
    onBeforeAnalysisCreate,
    onAfterAnalysisCreate,
    onAllParticipantsFailed,
  } = options;

  // Store actions
  const setScreenMode = useChatStore(s => s.setScreenMode);
  const initializeThread = useChatStore(s => s.initializeThread);
  const createdThreadId = useChatStore(s => s.createdThreadId);

  // Set screen mode on mount
  useEffect(() => {
    setScreenMode(mode);
    return () => setScreenMode(null);
  }, [mode, setScreenMode]);

  // Initialize thread when data is available
  useEffect(() => {
    if (thread && participants.length > 0) {
      initializeThread(thread, participants, initialMessages);
    }
  }, [thread, participants, initialMessages, initializeThread]);

  // ============================================================================
  // ANALYSIS ORCHESTRATION (Thread mode only)
  // ============================================================================

  const shouldEnableOrchestrator = mode === 'thread' && Boolean(thread?.id) && enableOrchestrator;

  useAnalysisOrchestrator({
    threadId: thread?.id || '',
    mode: chatMode || thread?.mode || DEFAULT_CHAT_MODE,
    enabled: shouldEnableOrchestrator,
  });

  // ============================================================================
  // ANALYSIS CALLBACKS (Overview & Thread modes)
  // ============================================================================

  useChatInitialization({
    threadId: thread?.id || createdThreadId || null,
    mode: chatMode || thread?.mode || null,
    isRegeneration,
    regeneratingRoundNumber,
    onBeforeCreate: onBeforeAnalysisCreate,
    onAfterCreate: onAfterAnalysisCreate,
    onAllParticipantsFailed,
  });
}
