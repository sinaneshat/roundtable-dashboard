/**
 * Chat Flow State Machine
 *
 * SINGLE SOURCE OF TRUTH for calculating chat flow state
 * Determines current state based on store data - does NOT orchestrate actions
 *
 * STATE MACHINE:
 * idle → creating_thread → streaming_participants → creating_moderator →
 * streaming_moderator → complete → navigating
 */

'use client';

import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { FlowState, ScreenMode } from '@/api/core/enums';
import {
  FlowStates,
  MessagePartTypes,
  MessageRoles,
  MessageStatuses,
  ScreenModes,
} from '@/api/core/enums';
import { useChatStore, useChatStoreApi } from '@/components/providers';
import { getAssistantMetadata, getCurrentRoundNumber, getRoundNumber } from '@/lib/utils';

import {
  getMessageStreamingStatus,
  getModeratorMessageForRound,
  getParticipantCompletionStatus,
} from '../utils/participant-completion-gate';

export type FlowContext = {
  // Thread state
  threadId: string | null;
  threadSlug: string | null;
  hasAiGeneratedTitle: boolean;
  currentRound: number;
  hasMessages: boolean;
  participantCount: number;
  allParticipantsResponded: boolean;
  moderatorStatus:
    | (typeof MessageStatuses)[keyof typeof MessageStatuses]
    | null;
  moderatorExists: boolean;
  isAiSdkStreaming: boolean;
  streamingJustCompleted: boolean;
  pendingAnimations: Set<number>;
  isCreatingThread: boolean;
  isCreatingModerator: boolean;
  hasNavigated: boolean;
  screenMode: ScreenMode | null;
};

// ============================================================================
// FLOW ACTION TYPE ENUM (Simplified - internal use only)
// ============================================================================

// CONSTANT OBJECT - For usage in code
const FlowActionTypes = {
  CREATE_THREAD: 'CREATE_THREAD' as const,
  START_PARTICIPANT_STREAMING: 'START_PARTICIPANT_STREAMING' as const,
  CREATE_MODERATOR: 'CREATE_MODERATOR' as const,
  START_MODERATOR_STREAMING: 'START_MODERATOR_STREAMING' as const,
  INVALIDATE_CACHE: 'INVALIDATE_CACHE' as const,
  NAVIGATE: 'NAVIGATE' as const,
  COMPLETE_FLOW: 'COMPLETE_FLOW' as const,
  RESET: 'RESET' as const,
} as const;

export type FlowAction
  = | { type: typeof FlowActionTypes.CREATE_THREAD }
    | { type: typeof FlowActionTypes.START_PARTICIPANT_STREAMING }
    | { type: typeof FlowActionTypes.CREATE_MODERATOR }
    | { type: typeof FlowActionTypes.START_MODERATOR_STREAMING }
    | { type: typeof FlowActionTypes.INVALIDATE_CACHE }
    | { type: typeof FlowActionTypes.NAVIGATE; slug: string }
    | { type: typeof FlowActionTypes.COMPLETE_FLOW }
    | { type: typeof FlowActionTypes.RESET };

function determineFlowState(context: FlowContext): FlowState {
  if (context.hasNavigated) {
    return FlowStates.COMPLETE;
  }

  if (
    context.screenMode === ScreenModes.OVERVIEW
    && context.moderatorStatus === MessageStatuses.COMPLETE
    && context.hasAiGeneratedTitle
    && context.threadSlug
  ) {
    return FlowStates.NAVIGATING;
  }

  if (
    context.moderatorStatus === MessageStatuses.STREAMING
    || (context.moderatorExists && context.isAiSdkStreaming)
  ) {
    return FlowStates.STREAMING_MODERATOR;
  }

  if (
    !context.isAiSdkStreaming
    && !context.streamingJustCompleted
    && context.allParticipantsResponded
    && context.participantCount > 0
    && !context.moderatorExists
    && !context.isCreatingModerator
    && context.pendingAnimations.size === 0
  ) {
    return FlowStates.CREATING_MODERATOR;
  }

  if (context.isAiSdkStreaming && !context.moderatorExists) {
    return FlowStates.STREAMING_PARTICIPANTS;
  }

  if (context.isCreatingThread) {
    return FlowStates.CREATING_THREAD;
  }

  return FlowStates.IDLE;
}

function shouldShowLoading(state: FlowState): boolean {
  return state !== FlowStates.IDLE && state !== FlowStates.COMPLETE;
}

function getLoadingMessage(state: FlowState): string {
  switch (state) {
    case FlowStates.CREATING_THREAD:
      return 'Creating conversation...';
    case FlowStates.STREAMING_PARTICIPANTS:
      return 'AI models responding...';
    case FlowStates.CREATING_MODERATOR:
      return 'Preparing moderator...';
    case FlowStates.STREAMING_MODERATOR:
      return 'Moderator responding...';
    case FlowStates.COMPLETING:
      return 'Finalizing...';
    case FlowStates.NAVIGATING:
      return 'Opening conversation...';
    default:
      return '';
  }
}

function getNextAction(
  prevState: FlowState,
  currentState: FlowState,
  context: FlowContext,
): FlowAction | null {
  if (
    currentState === FlowStates.CREATING_MODERATOR
    && prevState !== FlowStates.CREATING_MODERATOR
    && context.threadId
  ) {
    return { type: FlowActionTypes.CREATE_MODERATOR };
  }

  if (
    prevState === FlowStates.STREAMING_MODERATOR
    && currentState === FlowStates.NAVIGATING
    && context.threadSlug
    && !context.hasNavigated
  ) {
    return { type: FlowActionTypes.INVALIDATE_CACHE };
  }

  if (
    currentState === FlowStates.NAVIGATING
    && !context.hasNavigated
    && context.threadSlug
  ) {
    if (prevState === FlowStates.STREAMING_MODERATOR) {
      return null;
    }
    return { type: FlowActionTypes.NAVIGATE, slug: context.threadSlug };
  }

  return null;
}

export type UseFlowOrchestratorOptions = {
  mode: ScreenMode;
};

export type UseFlowOrchestratorReturn = {
  flowState: FlowState;
  isLoading: boolean;
  loadingMessage: string;
  currentRound: number;
};

/**
 * Chat Flow State Machine Hook
 *
 * Calculates current flow state based on store data
 * Pure state calculation - no side effects or navigation
 *
 * @example
 * const { flowState, isLoading, loadingMessage } = useFlowStateMachine({ mode: 'overview' })
 */
export function useFlowStateMachine(
  options: UseFlowOrchestratorOptions,
): UseFlowOrchestratorReturn {
  const { mode } = options;

  // ============================================================================
  // ✅ REACT 19 PATTERN: Batched store selectors with useShallow
  // Reduces re-renders by batching related state subscriptions
  // ============================================================================

  // State subscriptions (batched)
  const {
    thread,
    createdThreadId,
    isCreatingThread,
    messages,
    participants,
    isCreatingModerator,
    isAiSdkStreaming,
    screenMode,
    pendingAnimations,
  } = useChatStore(useShallow(s => ({
    thread: s.thread,
    createdThreadId: s.createdThreadId,
    isCreatingThread: s.isCreatingThread,
    messages: s.messages,
    participants: s.participants,
    isCreatingModerator: s.isModeratorStreaming,
    isAiSdkStreaming: s.isStreaming,
    screenMode: s.screenMode,
    pendingAnimations: s.pendingAnimations,
  })));

  // Actions (stable references - no need for useShallow)
  // 🚨 ATOMIC: Use tryMarkModeratorCreated to prevent race conditions
  const tryMarkModeratorCreated = useChatStore(s => s.tryMarkModeratorCreated);
  const completeStreaming = useChatStore(s => s.completeStreaming);

  // ✅ RACE CONDITION FIX: Get store API for fresh state reads inside effects
  // Prevents stale closure issues where effect runs with old messages
  const storeApi = useChatStoreApi();

  // Track navigation state
  const [hasNavigated, setHasNavigated] = useState(false);

  // ============================================================================
  // ✅ FIX: Track streaming completion using frame-based async instead of timeouts
  // When streaming ends, the UI needs time to render the final content.
  // Uses requestAnimationFrame to wait for actual browser paint completion.
  // ============================================================================
  const [streamingJustCompleted, setStreamingJustCompleted] = useState(false);
  const rafIdRef = useRef<number | null>(null);
  const wasStreamingRef = useRef(false);

  useEffect(() => {
    // Clean up RAF on unmount
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  // Streaming lifecycle state machine - tracks streaming completion for UI timing
  useEffect(() => {
    if (isAiSdkStreaming) {
      // Streaming started - track it and clear any pending completion
      wasStreamingRef.current = true;
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Streaming state machine transition
      setStreamingJustCompleted(false);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    } else if (wasStreamingRef.current && messages.length > 0) {
      // Streaming just ended - set flag and wait for UI to render
      // Use double-rAF pattern to ensure browser has painted the final frame
      wasStreamingRef.current = false;
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Streaming state machine transition
      setStreamingJustCompleted(true);

      // First rAF: scheduled for next frame
      rafIdRef.current = requestAnimationFrame(() => {
        // Second rAF: ensures previous frame was painted
        rafIdRef.current = requestAnimationFrame(() => {
          // Third rAF: extra safety for complex renders
          rafIdRef.current = requestAnimationFrame(() => {
            setStreamingJustCompleted(false);
            rafIdRef.current = null;
          });
        });
      });
    }

    // ✅ FIX: Cleanup RAF chain on unmount to prevent orphan callbacks
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isAiSdkStreaming, messages.length]);

  // ============================================================================
  // BUILD FLOW CONTEXT
  // ============================================================================

  const context = useMemo((): FlowContext => {
    const threadId = thread?.id || createdThreadId;
    const currentRound
      = messages.length > 0 ? getCurrentRoundNumber(messages) : 0;

    // ✅ TEXT STREAMING: Check for moderator message for CURRENT round
    // Moderator messages have metadata.isModerator: true
    const currentRoundModeratorMessage = getModeratorMessageForRound(messages, currentRound);

    // ✅ FIX: Count participant messages for CURRENT round only
    // ✅ TYPE-SAFE: Use extraction utility instead of manual metadata access
    // ✅ ENUM PATTERN: Use MessageRoles constant instead of hardcoded string
    const participantMessagesInRound = messages.filter((m) => {
      return (
        m.role === MessageRoles.ASSISTANT
        && getRoundNumber(m.metadata) === currentRound
      );
    });

    // ✅ FIX: Only count messages that have ACTUAL CONTENT or finished with a reason
    // Empty messages (parts: []) are placeholders created by AI SDK before streaming completes
    // Don't count them as "responded" or moderator will trigger prematurely
    const completedMessagesInRound = participantMessagesInRound.filter((m) => {
      // ✅ STREAMING CHECK: Don't count messages that still have streaming parts
      // AI SDK v5 marks parts with state: 'streaming' while content is being generated
      // A message with content but streaming parts is still in-flight
      const hasStreamingParts = m.parts?.some(
        p => 'state' in p && p.state === 'streaming',
      ) ?? false;
      if (hasStreamingParts)
        return false;

      // Check for text content
      const hasTextContent = m.parts?.some(
        p => p.type === MessagePartTypes.TEXT && 'text' in p && p.text,
      );
      if (hasTextContent)
        return true;

      // Check for finishReason (streaming complete, even if empty due to error)
      // ✅ FIX: Accept ANY finishReason (including 'unknown') as completion signal
      // 'unknown' finishReason means the stream ended (possibly abnormally) but is no longer active
      const metadata = getAssistantMetadata(m.metadata);
      const finishReason = metadata?.finishReason;
      if (finishReason)
        return true;

      return false;
    });

    const allParticipantsResponded
      = completedMessagesInRound.length >= participants.length
        && participants.length > 0;

    // ✅ TEXT STREAMING: Determine moderator message status
    // Check if the message is still streaming by looking for streaming parts
    let moderatorStatus: FlowContext['moderatorStatus'] = null;
    if (currentRoundModeratorMessage) {
      moderatorStatus = getMessageStreamingStatus(currentRoundModeratorMessage);
    }

    return {
      threadId,
      threadSlug: thread?.slug || null,
      hasAiGeneratedTitle: thread?.isAiGeneratedTitle ?? false,
      currentRound,
      hasMessages: messages.length > 0,
      participantCount: participants.length,
      allParticipantsResponded,
      moderatorStatus,
      moderatorExists: !!currentRoundModeratorMessage,
      isAiSdkStreaming,
      streamingJustCompleted,
      pendingAnimations,
      isCreatingThread,
      isCreatingModerator,
      hasNavigated,
      screenMode,
    };
  }, [
    thread,
    createdThreadId,
    messages,
    participants,
    isAiSdkStreaming,
    streamingJustCompleted,
    pendingAnimations,
    isCreatingThread,
    isCreatingModerator,
    hasNavigated,
    screenMode,
  ]);

  // ============================================================================
  // COMPUTE CURRENT STATE
  // ============================================================================

  const flowState = useMemo(() => determineFlowState(context), [context]);
  // Initialize prevState as idle instead of current flowState
  // This ensures we detect the transition TO creating_moderator even if component
  // mounts after streaming has finished (fast streaming race condition)
  const prevStateRef = useRef<FlowState>(FlowStates.IDLE);

  // ============================================================================
  // STATE TRANSITION SIDE EFFECTS
  // ============================================================================

  useEffect(() => {
    const prevState = prevStateRef.current;
    const action = getNextAction(prevState, flowState, context);

    if (action) {
      switch (action.type) {
        case FlowActionTypes.CREATE_MODERATOR: {
          // ✅ TEXT STREAMING: Mark moderator as ready to create
          // The actual moderator streaming is triggered by useModeratorTrigger hook
          const { threadId, currentRound } = context;

          if (threadId && messages.length > 0) {
            // ✅ RACE CONDITION FIX: Get FRESH state directly from store
            const freshState = storeApi.getState();
            const freshMessages = freshState.messages;
            const freshParticipants = freshState.participants;

            // ✅ STRICT STREAMING CHECK: Block moderator if AI SDK is still streaming
            if (freshState.isStreaming) {
              return; // Exit effect without updating prevStateRef
            }

            // ✅ STRICT COMPLETION GATE: Use centralized utility for participant completion check
            const completionStatus = getParticipantCompletionStatus(
              freshMessages,
              freshParticipants,
              currentRound,
            );

            if (!completionStatus.allComplete) {
              return; // Exit effect without updating prevStateRef
            }

            // 🚨 ATOMIC: tryMarkModeratorCreated returns false if already created
            // ✅ RACE FIX: Only call completeStreaming() once, regardless of whether
            // moderator was just created or already existed
            const moderatorJustCreated = tryMarkModeratorCreated(currentRound);

            // ✅ TEXT STREAMING: Complete streaming state (only once)
            // useModeratorTrigger hook triggers POST /api/v1/chat/moderator
            if (!freshState.isModeratorStreaming) {
              // Only complete if moderator streaming hasn't started yet
              // This prevents double-completion when moderator trigger is already running
              completeStreaming();
            }

            if (!moderatorJustCreated) {
              break; // Moderator already created by another component, skip
            }
          }
          break;
        }

        case FlowActionTypes.INVALIDATE_CACHE: {
          // ✅ TEXT STREAMING: Moderator messages are now regular messages in chatMessage table
          // Displayed inline via ChatMessageList, no separate cache to invalidate

          // =========================================================================
          // ✅ CRITICAL FIX: NO SERVER NAVIGATION - Eliminates loading.tsx skeleton
          // =========================================================================
          //
          // WHY: Next.js App Router with `dynamic = 'force-dynamic'` ALWAYS shows
          // loading.tsx during server render. Prefetching only works for static routes.
          //
          // SOLUTION: Don't trigger server navigation at all!
          // - URL is already `/chat/[slug]` from history.replaceState (flow-controller.ts)
          // - Overview screen already renders thread content when !showInitialUI
          // - All data (messages, summaries, etc.) is in Zustand store
          //
          // Mark as navigated to prevent repeated actions, but don't router.push
          if (
            mode === ScreenModes.OVERVIEW
            && context.threadSlug
            && !context.hasNavigated
          ) {
            startTransition(() => {
              setHasNavigated(true);
            });
          }
          break;
        }

        case FlowActionTypes.NAVIGATE: {
          // =========================================================================
          // ✅ CRITICAL FIX: NO SERVER NAVIGATION - Eliminates loading.tsx skeleton
          // =========================================================================
          // Mark as navigated but don't trigger router.push - overview screen already
          // shows thread content and URL is already correct from flow-controller.ts
          if (mode === ScreenModes.OVERVIEW && action.slug) {
            startTransition(() => {
              setHasNavigated(true);
            });
          }
          break;
        }
      }
    }

    // Update previous state
    prevStateRef.current = flowState;
  }, [
    flowState,
    context,
    mode,
    messages,
    participants,
    thread,
    storeApi,
    tryMarkModeratorCreated,
    completeStreaming,
  ]);

  // ============================================================================
  // COMPUTE DERIVED STATE
  // ============================================================================

  const isLoading = shouldShowLoading(flowState);
  const loadingMessage = getLoadingMessage(flowState);

  return {
    flowState,
    isLoading,
    loadingMessage,
    currentRound: context.currentRound,
  };
}
