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

import type { FlowState, MessageStatus, ScreenMode } from '@roundtable/shared';
import {
  FlowStates,
  MessagePartTypes,
  MessageRoles,
  MessageStatuses,
  MessageStatusSchema,
  ScreenModes,
  ScreenModeSchema,
  TextPartStates,
} from '@roundtable/shared';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { useShallow } from 'zustand/react/shallow';

import { useChatStore, useChatStoreApi } from '@/components/providers/chat-store-provider/context';
import { getAssistantMetadata, getCurrentRoundNumber, getModeratorMetadata, getRoundNumber } from '@/lib/utils';

import {
  getMessageStreamingStatus,
  getParticipantCompletionStatus,
} from '../utils/participant-completion-gate';

// ============================================================================
// ZOD SCHEMAS - Single source of truth for type definitions
// ============================================================================

/**
 * Flow context schema - captures all state needed for flow state calculation
 *
 * ✅ ZOD-FIRST PATTERN: Type inferred from schema for maximum type safety
 */
export const FlowContextSchema = z.object({
  allParticipantsResponded: z.boolean(),
  currentRound: z.number().int().nonnegative(),
  hasAiGeneratedTitle: z.boolean(),
  hasMessages: z.boolean(),
  hasNavigated: z.boolean(),
  isAiSdkStreaming: z.boolean(),
  isCreatingModerator: z.boolean(),
  isCreatingThread: z.boolean(),
  moderatorExists: z.boolean(),
  moderatorStatus: MessageStatusSchema.nullable(),
  participantCount: z.number().int().nonnegative(),
  pendingAnimations: z.custom<Set<number>>(val => val instanceof Set),
  screenMode: ScreenModeSchema.nullable(),
  streamingJustCompleted: z.boolean(),
  threadId: z.string().nullable(),
  threadSlug: z.string().nullable(),
});

export type FlowContext = z.infer<typeof FlowContextSchema>;

const FlowActionTypes = {
  COMPLETE_FLOW: 'COMPLETE_FLOW',
  CREATE_MODERATOR: 'CREATE_MODERATOR',
  CREATE_THREAD: 'CREATE_THREAD',
  INVALIDATE_CACHE: 'INVALIDATE_CACHE',
  NAVIGATE: 'NAVIGATE',
  RESET: 'RESET',
  START_MODERATOR_STREAMING: 'START_MODERATOR_STREAMING',
  START_PARTICIPANT_STREAMING: 'START_PARTICIPANT_STREAMING',
} as const;

export type FlowAction
  = | { type: 'CREATE_THREAD' }
    | { type: 'START_PARTICIPANT_STREAMING' }
    | { type: 'CREATE_MODERATOR' }
    | { type: 'START_MODERATOR_STREAMING' }
    | { type: 'INVALIDATE_CACHE' }
    | { type: 'NAVIGATE'; slug: string }
    | { type: 'COMPLETE_FLOW' }
    | { type: 'RESET' };

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
    return { slug: context.threadSlug, type: FlowActionTypes.NAVIGATE };
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
    createdThreadId,
    isAiSdkStreaming,
    isCreatingModerator,
    isCreatingThread,
    messages,
    participants,
    pendingAnimations,
    screenMode,
    thread,
  } = useChatStore(useShallow(s => ({
    createdThreadId: s.createdThreadId,
    isAiSdkStreaming: s.isStreaming,
    isCreatingModerator: s.isModeratorStreaming,
    isCreatingThread: s.isCreatingThread,
    messages: s.messages,
    participants: s.participants,
    pendingAnimations: s.pendingAnimations,
    screenMode: s.screenMode,
    thread: s.thread,
  })));

  // ✅ RACE CONDITION FIX: Get store API for fresh state reads inside effects
  // Prevents stale closure issues where effect runs with old messages
  const storeApi = useChatStoreApi();

  // Track navigation state
  // ✅ FIX: Use ref to track immediately, preventing re-entry during startTransition
  // Refs update synchronously; state via startTransition is deferred → effects see stale state
  const [hasNavigated, setHasNavigated] = useState(false);
  const hasNavigatedRef = useRef(false);

  const [streamingJustCompleted, setStreamingJustCompleted] = useState(false);
  const rafIdRef = useRef<number | null>(null);
  const wasStreamingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isAiSdkStreaming) {
      wasStreamingRef.current = true;
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- State machine transition
      setStreamingJustCompleted(false);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    } else if (wasStreamingRef.current && messages.length > 0) {
      wasStreamingRef.current = false;
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- State machine transition
      setStreamingJustCompleted(true);

      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = requestAnimationFrame(() => {
            setStreamingJustCompleted(false);
            rafIdRef.current = null;
          });
        });
      });
    }

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isAiSdkStreaming, messages.length]);

  const context = useMemo((): FlowContext => {
    const threadId = thread?.id || createdThreadId;
    const currentRound
      = messages.length > 0 ? getCurrentRoundNumber(messages) : 0;

    // ✅ PERF FIX: Single pass through messages to collect all round info
    // Previously O(3n): 3 separate scans (moderator find, participant filter, completed filter)
    // Now O(n): Single pass collecting moderator, participant count, and completed count
    let currentRoundModeratorMessage: typeof messages[0] | null = null;
    let completedCount = 0;

    for (const m of messages) {
      if (m.role !== MessageRoles.ASSISTANT) {
        continue;
      }
      if (getRoundNumber(m.metadata) !== currentRound) {
        continue;
      }

      // Check if moderator message (use type-safe utility)
      const modMeta = getModeratorMetadata(m.metadata);
      if (modMeta) {
        currentRoundModeratorMessage = m;
        continue; // Moderator doesn't count toward participant completion
      }

      // Check if participant message is complete
      const hasStreamingParts = m.parts?.some(
        p => 'state' in p && p.state === TextPartStates.STREAMING,
      ) ?? false;

      if (!hasStreamingParts) {
        // ✅ V8 FIX: Include REASONING type for models like Gemini Flash
        const hasTextContent = m.parts?.some(
          p => (p.type === MessagePartTypes.TEXT || p.type === MessagePartTypes.REASONING) && 'text' in p && p.text,
        );

        if (hasTextContent) {
          completedCount++;
        } else {
          const metadata = getAssistantMetadata(m.metadata);
          if (metadata?.finishReason) {
            completedCount++;
          }
        }
      }
    }

    const allParticipantsResponded
      = completedCount >= participants.length
        && participants.length > 0;

    let moderatorStatus: MessageStatus | null = null;
    if (currentRoundModeratorMessage) {
      moderatorStatus = getMessageStreamingStatus(currentRoundModeratorMessage);
    }

    return {
      allParticipantsResponded,
      currentRound,
      hasAiGeneratedTitle: thread?.isAiGeneratedTitle ?? false,
      hasMessages: messages.length > 0,
      hasNavigated,
      isAiSdkStreaming,
      isCreatingModerator,
      isCreatingThread,
      moderatorExists: !!currentRoundModeratorMessage,
      moderatorStatus,
      participantCount: participants.length,
      pendingAnimations,
      screenMode,
      streamingJustCompleted,
      threadId,
      threadSlug: thread?.slug || null,
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

  const flowState = useMemo(() => determineFlowState(context), [context]);
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
          const { currentRound, threadId } = context;

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
            // ✅ FLASH FIX: Do NOT call completeStreaming() here!
            // The moderator trigger (use-moderator-trigger.ts) calls completeStreaming()
            // in its finally block AFTER the moderator stream completes.
            // Calling it here would clear streamingRoundNumber prematurely, causing a flash
            // where pending cards disappear and reappear.
            const moderatorJustCreated = freshState.tryMarkModeratorCreated(currentRound);

            if (!moderatorJustCreated) {
              break; // Moderator already created by another component, skip
            }

            // ✅ FLASH FIX: Set isModeratorStreaming=true IMMEDIATELY when transitioning
            // This bridges the gap between isStreaming=false and moderator stream starting.
            // Without this, there's a timing window where all streaming flags are false,
            // causing shouldShowPendingCards=false → participant cards briefly disappear.
            freshState.setIsModeratorStreaming(true);
          }
          break;
        }

        case FlowActionTypes.INVALIDATE_CACHE: {
          // ✅ TEXT STREAMING: Moderator messages are now regular messages in chatMessage table
          // Displayed inline via ChatMessageList, no separate cache to invalidate

          // =========================================================================
          // ✅ CRITICAL FIX: NO SERVER NAVIGATION - Client-side URL update only
          // =========================================================================
          //
          // SOLUTION: Don't trigger server navigation at all!
          // - URL is already `/chat/[slug]` from history.replaceState (flow-controller.ts)
          // - Overview screen already renders thread content when !showInitialUI
          // - All data (messages, summaries, etc.) is in Zustand store
          //
          // Mark as navigated to prevent repeated actions, but don't router.push
          // ✅ FIX: Check REF not context.hasNavigated - ref updates synchronously
          if (
            mode === ScreenModes.OVERVIEW
            && context.threadSlug
            && !hasNavigatedRef.current
          ) {
            // ✅ FIX: Set ref IMMEDIATELY to prevent re-entry before startTransition propagates
            hasNavigatedRef.current = true;
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
          // ✅ FIX: Check REF to prevent re-entry - ref updates synchronously
          if (mode === ScreenModes.OVERVIEW && action.slug && !hasNavigatedRef.current) {
            // ✅ FIX: Set ref IMMEDIATELY to prevent re-entry before startTransition propagates
            hasNavigatedRef.current = true;
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
  ]);

  // ============================================================================
  // COMPUTE DERIVED STATE
  // ============================================================================

  const isLoading = shouldShowLoading(flowState);
  const loadingMessage = getLoadingMessage(flowState);

  return {
    currentRound: context.currentRound,
    flowState,
    isLoading,
    loadingMessage,
  };
}
