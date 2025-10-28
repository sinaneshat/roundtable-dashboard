/**
 * Chat Initialization Hook
 *
 * Zustand v5 Pattern: Stable initialization hook for screen-specific setup
 * Handles analysis callback registration without infinite loops.
 *
 * INTERNAL HOOK - DO NOT EXPORT
 * Used by useScreenInitialization to set up analysis callbacks.
 * Screens should use useScreenInitialization instead.
 *
 * CALLBACK LIFECYCLE:
 * 1. Hook receives options (threadId, mode, callbacks)
 * 2. Creates stable createPendingAnalysisWrapper using refs
 * 3. Passes wrapper to useAnalysisCreation
 * 4. useAnalysisCreation returns handleComplete callback
 * 5. Registers handleComplete with CallbackContext via registerOnComplete
 * 6. ChatStoreProvider triggers callback when AI SDK streaming completes
 *
 * Location: /src/stores/chat/actions/chat-initialization.ts
 * Used by: useScreenInitialization (internal composition)
 */

'use client';

import type { UIMessage } from 'ai';
import { useCallback, useEffect, useRef } from 'react';

import type { ChatParticipant } from '@/api/routes/chat/schema';
import { useChatCallbacks, useChatStore } from '@/components/providers/chat-store-provider';
import { useSyncedMessageRefs } from '@/hooks/utils';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { getDefaultChatMode } from '@/lib/config/chat-modes';

import { useAnalysisCreation } from './analysis-creation';

export type UseChatInitializationOptions = {
  /**
   * Thread ID for analysis creation
   * Can be from existing thread or newly created thread
   */
  threadId: string | null;

  /**
   * Chat mode for analysis
   */
  mode: ChatModeId | null;

  /**
   * Optional callbacks for analysis lifecycle
   */
  onBeforeCreate?: (roundNumber: number) => void;
  onAfterCreate?: (roundNumber: number) => void;
  onAllParticipantsFailed?: (roundNumber: number) => void;

  /**
   * Whether currently in regeneration mode
   */
  isRegeneration?: boolean;

  /**
   * Round number being regenerated
   */
  regeneratingRoundNumber?: number | null;
};

/**
 * Initialize chat screen with stable analysis callback
 *
 * This hook sets up the onComplete callback for analysis creation
 * in a way that prevents infinite loops by using refs for stability.
 *
 * Pattern:
 * 1. Creates stable createPendingAnalysis wrapper using refs
 * 2. Creates analysis callback using useAnalysisCreation
 * 3. Registers callback to store only when threadId changes
 *
 * @example
 * // Overview screen (simple)
 * useChatInitialization({
 *   threadId: createdThreadId,
 *   mode: selectedMode,
 * });
 *
 * @example
 * // Thread screen (with regeneration)
 * useChatInitialization({
 *   threadId: thread.id,
 *   mode: thread.mode,
 *   isRegeneration: regeneratingRoundNumber !== null,
 *   regeneratingRoundNumber,
 *   onBeforeCreate: () => setIsCreatingAnalysis(true),
 *   onAfterCreate: (round) => {
 *     setIsCreatingAnalysis(false);
 *     queryClient.invalidateQueries(...);
 *   },
 * });
 */
export function useChatInitialization(options: UseChatInitializationOptions) {
  const {
    threadId,
    mode,
    onBeforeCreate,
    onAfterCreate,
    onAllParticipantsFailed,
    isRegeneration = false,
    regeneratingRoundNumber = null,
  } = options;

  // ✅ OPTIMIZATION: Use callback registration instead of store
  const { registerOnComplete } = useChatCallbacks();

  // Store selectors
  const messages = useChatStore(s => s.messages);
  const participants = useChatStore(s => s.participants);
  const createPendingAnalysis = useChatStore(s => s.createPendingAnalysis);

  // Use refs for stability - prevents infinite loops
  const threadIdRef = useRef(threadId);
  const modeRef = useRef(mode);

  // Update refs when values change
  useEffect(() => {
    threadIdRef.current = threadId;
  }, [threadId]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Synced message/participant refs
  const { messagesRef, participantsRef } = useSyncedMessageRefs({
    messages,
    participants,
  });

  // Stable wrapper using refs
  const createPendingAnalysisWrapper = useCallback(
    (
      roundNumber: number,
      messages: UIMessage[],
      participants: ChatParticipant[],
      userQuestion: string,
    ) => {
      createPendingAnalysis({
        roundNumber,
        messages,
        participants,
        userQuestion,
        threadId: threadIdRef.current || '',
        mode: modeRef.current || getDefaultChatMode(),
      });
    },
    [createPendingAnalysis],
  );

  // Create analysis callback with refs (prevents infinite loops)
  const { handleComplete: baseAnalysisCallback } = useAnalysisCreation({
    createPendingAnalysis: createPendingAnalysisWrapper,
    messages,
    participants,
    messagesRef,
    participantsRef,
    isRegeneration,
    regeneratingRoundNumber,
    onBeforeCreate,
    onAfterCreate,
    onAllParticipantsFailed,
  });

  // Store latest callback in ref (prevents effect re-runs)
  const callbackRef = useRef(baseAnalysisCallback);
  useEffect(() => {
    callbackRef.current = baseAnalysisCallback;
  }, [baseAnalysisCallback]);

  // Create stable wrapper that uses ref
  const stableCallback = useCallback(() => {
    callbackRef.current?.();
  }, []);

  // Register callback ONCE when threadId becomes available
  // Never re-register (stable wrapper uses ref internally)
  const hasRegisteredRef = useRef(false);

  useEffect(() => {
    // Only register once when threadId is available
    if (threadId && !hasRegisteredRef.current) {
      hasRegisteredRef.current = true;
      registerOnComplete(stableCallback);
    }

    // Cleanup only on unmount or threadId change
    return () => {
      if (threadId) {
        registerOnComplete(undefined);
        hasRegisteredRef.current = false;
      }
    };
    // ✅ OPTIMIZATION: registerOnComplete is stable (no dependencies)
  }, [threadId, stableCallback, registerOnComplete]);
}
