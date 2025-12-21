/**
 * Chat Flow State Machine
 *
 * SINGLE SOURCE OF TRUTH for calculating chat flow state
 * Determines current state based on store data - does NOT orchestrate actions
 *
 * STATE MACHINE:
 * idle → creating_thread → streaming_participants → creating_moderator →
 * streaming_moderator → complete → navigating
 *
 * CRITICAL: This is a PURE STATE CALCULATOR, not an orchestrator
 * Navigation and side effects handled by flow-controller.ts
 *
 * Location: /src/stores/chat/actions/flow-state-machine.ts
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
import { useChatStore, useChatStoreApi } from '@/components/providers/chat-store-provider';
import { getAssistantMetadata, getRoundNumber } from '@/lib/utils/metadata';
import { getCurrentRoundNumber } from '@/lib/utils/round-utils';

import {
  getMessageStreamingStatus,
  getModeratorMessageForRound,
  getParticipantCompletionStatus,
  logParticipantCompletionStatus,
} from '../utils/participant-completion-gate';

// ============================================================================
// FLOW STATE MACHINE TYPES
// ============================================================================

/**
 * Flow context contains all data needed to determine state transitions
 * FlowState type is imported from @/api/core/enums (5-part enum pattern)
 */
export type FlowContext = {
  // Thread state
  threadId: string | null;
  threadSlug: string | null;
  hasAiGeneratedTitle: boolean;

  // Message/participant state
  currentRound: number;
  hasMessages: boolean;
  participantCount: number;
  allParticipantsResponded: boolean; // All participants responded for current round

  // Moderator state
  moderatorStatus:
    | (typeof MessageStatuses)[keyof typeof MessageStatuses]
    | null;
  moderatorExists: boolean;

  // SDK state
  isAiSdkStreaming: boolean;
  // ✅ FIX: Track if streaming just completed (within delay window)
  // Prevents moderator from triggering before UI renders final content
  streamingJustCompleted: boolean;

  // Animation state
  // ✅ RACE FIX: Track pending animations (pre-search, participants)
  // Prevents moderator from triggering before animations complete
  pendingAnimations: Set<number>;

  // Flags
  isCreatingThread: boolean;
  isCreatingModerator: boolean;
  hasNavigated: boolean;

  // Screen mode
  screenMode: ScreenMode | null;
};

/**
 * Flow actions that can be triggered by state transitions
 */
export type FlowAction
  = | { type: 'CREATE_THREAD' }
    | { type: 'START_PARTICIPANT_STREAMING' }
    | { type: 'CREATE_MODERATOR' }
    | { type: 'START_MODERATOR_STREAMING' }
    | { type: 'INVALIDATE_CACHE' }
    | { type: 'NAVIGATE'; slug: string }
    | { type: 'COMPLETE_FLOW' }
    | { type: 'RESET' };

// ============================================================================
// STATE MACHINE LOGIC
// ============================================================================

/**
 * Determines current flow state based on context
 * SINGLE SOURCE OF TRUTH for what state we're in
 */
function determineFlowState(context: FlowContext): FlowState {
  // Priority 1: Navigation complete
  if (context.hasNavigated) {
    return FlowStates.COMPLETE;
  }

  // Priority 2: Ready to navigate (moderator done + title ready)
  // Only navigate in overview mode - thread screen already at destination
  if (
    context.screenMode === ScreenModes.OVERVIEW
    && context.moderatorStatus === MessageStatuses.COMPLETE
    && context.hasAiGeneratedTitle
    && context.threadSlug
  ) {
    return FlowStates.NAVIGATING;
  }

  // Priority 3: Moderator streaming
  // Also consider moderator streaming if moderator exists and AI SDK is streaming
  // This handles race condition where status hasn't been updated to 'streaming' yet
  if (
    context.moderatorStatus === MessageStatuses.STREAMING
    || (context.moderatorExists && context.isAiSdkStreaming)
  ) {
    return FlowStates.STREAMING_MODERATOR;
  }

  // Priority 4: Creating moderator (participants done, no moderator yet)
  // Check if all participants responded for CURRENT round before creating moderator
  // ✅ FIX: Also check streamingJustCompleted to ensure UI has rendered final content
  // ✅ RACE FIX: Don't create moderator if ANY animations still pending (pre-search, participants)
  if (
    !context.isAiSdkStreaming
    && !context.streamingJustCompleted // Wait for delay after streaming ends
    && context.allParticipantsResponded // All participants must respond for current round
    && context.participantCount > 0
    && !context.moderatorExists // Checks current round
    && !context.isCreatingModerator
    && context.pendingAnimations.size === 0 // Wait for ALL animations (pre-search, participants) to complete
  ) {
    return FlowStates.CREATING_MODERATOR;
  }

  // Priority 5: Participants streaming
  // Only return streaming_participants if no moderator exists yet
  // Once moderator exists and isAiSdkStreaming is true, that's moderator streaming (Priority 3),
  // not participant streaming. This prevents falling back to streaming_participants during moderator.
  if (context.isAiSdkStreaming && !context.moderatorExists) {
    return FlowStates.STREAMING_PARTICIPANTS;
  }

  // Priority 6: Thread creation
  if (context.isCreatingThread) {
    return FlowStates.CREATING_THREAD;
  }

  // Default: Idle
  return FlowStates.IDLE;
}

/**
 * Determines if any loading indicator should be shown
 * SINGLE SOURCE OF TRUTH for loading state
 */
function shouldShowLoading(state: FlowState): boolean {
  return state !== FlowStates.IDLE && state !== FlowStates.COMPLETE;
}

/**
 * Gets user-facing loading message for current state
 */
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

/**
 * Determines which action should be triggered for state transition
 */
function getNextAction(
  prevState: FlowState,
  currentState: FlowState,
  context: FlowContext,
): FlowAction | null {
  // Transition: idle → creating_thread (handled by form submission)
  // No action needed here

  // Transition: creating_thread → streaming_participants (handled by AI SDK)
  // No action needed here

  // Transition: * → creating_moderator
  // Trigger CREATE_MODERATOR from any previous state (not just streaming_participants)
  // This handles race condition where streaming finishes before component mounts
  if (
    currentState === FlowStates.CREATING_MODERATOR
    && prevState !== FlowStates.CREATING_MODERATOR
    && context.threadId
  ) {
    return { type: 'CREATE_MODERATOR' };
  }

  // Transition: creating_moderator → streaming_moderator (handled by moderator component)
  // No action needed here

  // Transition: streaming_moderator → navigating (cache invalidation)
  // PRIORITY 1: Invalidate cache BEFORE navigating
  if (
    prevState === FlowStates.STREAMING_MODERATOR
    && currentState === FlowStates.NAVIGATING
    && context.threadSlug
    && !context.hasNavigated
  ) {
    return { type: 'INVALIDATE_CACHE' };
  }

  // Transition: * → navigating (navigation execution)
  // PRIORITY 2: Execute navigation when in navigating state and not yet navigated
  // Handles both:
  // 1. Direct jump to navigating (prevState !== FlowStates.NAVIGATING)
  // 2. After cache invalidation (prevState === FlowStates.NAVIGATING, currentState === FlowStates.NAVIGATING)
  if (
    currentState === FlowStates.NAVIGATING
    && !context.hasNavigated
    && context.threadSlug
  ) {
    // Skip if we just returned INVALIDATE_CACHE (will be handled in next effect run)
    if (prevState === FlowStates.STREAMING_MODERATOR) {
      return null;
    }
    return { type: 'NAVIGATE', slug: context.threadSlug };
  }

  return null;
}

// ============================================================================
// ORCHESTRATOR HOOK
// ============================================================================

export type UseFlowOrchestratorOptions = {
  /** Screen mode - determines which transitions are active */
  mode: ScreenMode;
};

export type UseFlowOrchestratorReturn = {
  /** Current flow state */
  flowState: FlowState;
  /** Whether any loading indicator should show */
  isLoading: boolean;
  /** User-facing loading message */
  loadingMessage: string;
  /** Current round number */
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
        case 'CREATE_MODERATOR': {
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
              logParticipantCompletionStatus(completionStatus, 'flow-state-machine:CREATE_MODERATOR');
              return; // Exit effect without updating prevStateRef
            }

            // 🚨 ATOMIC: tryMarkModeratorCreated returns false if already created
            if (!tryMarkModeratorCreated(currentRound)) {
              completeStreaming();
              break; // Moderator already created by another component, skip
            }

            // ✅ TEXT STREAMING: Just complete streaming state
            // useModeratorTrigger hook triggers POST /api/v1/chat/moderator
            completeStreaming();
          }
          break;
        }

        case 'INVALIDATE_CACHE': {
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

        case 'NAVIGATE': {
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
