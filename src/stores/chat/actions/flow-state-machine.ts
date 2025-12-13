/**
 * Chat Flow State Machine
 *
 * SINGLE SOURCE OF TRUTH for calculating chat flow state
 * Determines current state based on store data - does NOT orchestrate actions
 *
 * STATE MACHINE:
 * idle → creating_thread → streaming_participants → creating_analysis →
 * streaming_analysis → complete → navigating
 *
 * CRITICAL: This is a PURE STATE CALCULATOR, not an orchestrator
 * Navigation and side effects handled by flow-controller.ts
 *
 * Location: /src/stores/chat/actions/flow-state-machine.ts
 */

'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { TextPart, UIMessage } from 'ai';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { FlowState, ScreenMode } from '@/api/core/enums';
import {
  AnalysisStatuses,
  DEFAULT_CHAT_MODE,
  FinishReasons,
  FlowStates,
  MessagePartTypes,
  MessageRoles,
  ScreenModes,
} from '@/api/core/enums';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { queryKeys } from '@/lib/data/query-keys';
import { getAssistantMetadata, getRoundNumber } from '@/lib/utils/metadata';
import { getCurrentRoundNumber } from '@/lib/utils/round-utils';

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

  // Analysis state
  analysisStatus:
    | (typeof AnalysisStatuses)[keyof typeof AnalysisStatuses]
    | null;
  analysisExists: boolean;

  // SDK state
  isAiSdkStreaming: boolean;

  // Flags
  isCreatingThread: boolean;
  isCreatingAnalysis: boolean;
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
    | { type: 'CREATE_ANALYSIS' }
    | { type: 'START_ANALYSIS_STREAMING' }
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

  // Priority 2: Ready to navigate (analysis done + title ready)
  // Only navigate in overview mode - thread screen already at destination
  if (
    context.screenMode === ScreenModes.OVERVIEW
    && context.analysisStatus === AnalysisStatuses.COMPLETE
    && context.hasAiGeneratedTitle
    && context.threadSlug
  ) {
    return FlowStates.NAVIGATING;
  }

  // Priority 3: Analysis streaming
  // Also consider analysis streaming if analysis exists and AI SDK is streaming
  // This handles race condition where status hasn't been updated to 'streaming' yet
  if (
    context.analysisStatus === AnalysisStatuses.STREAMING
    || (context.analysisExists && context.isAiSdkStreaming)
  ) {
    return FlowStates.STREAMING_ANALYSIS;
  }

  // Priority 4: Creating analysis (participants done, no analysis yet)
  // Check if all participants responded for CURRENT round before creating analysis
  if (
    !context.isAiSdkStreaming
    && context.allParticipantsResponded // All participants must respond for current round
    && context.participantCount > 0
    && !context.analysisExists // Checks current round
    && !context.isCreatingAnalysis
  ) {
    return FlowStates.CREATING_ANALYSIS;
  }

  // Priority 5: Participants streaming
  // Only return streaming_participants if no analysis exists yet
  // Once analysis exists and isAiSdkStreaming is true, that's analysis streaming (Priority 3),
  // not participant streaming. This prevents falling back to streaming_participants during analysis.
  if (context.isAiSdkStreaming && !context.analysisExists) {
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
    case FlowStates.CREATING_ANALYSIS:
      return 'Preparing analysis...';
    case FlowStates.STREAMING_ANALYSIS:
      return 'Analyzing responses...';
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

  // Transition: * → creating_analysis
  // Trigger CREATE_ANALYSIS from any previous state (not just streaming_participants)
  // This handles race condition where streaming finishes before component mounts
  if (
    currentState === FlowStates.CREATING_ANALYSIS
    && prevState !== FlowStates.CREATING_ANALYSIS
    && context.threadId
  ) {
    return { type: 'CREATE_ANALYSIS' };
  }

  // Transition: creating_analysis → streaming_analysis (handled by analysis component)
  // No action needed here

  // Transition: streaming_analysis → navigating (cache invalidation)
  // PRIORITY 1: Invalidate cache BEFORE navigating
  if (
    prevState === FlowStates.STREAMING_ANALYSIS
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
    if (prevState === FlowStates.STREAMING_ANALYSIS) {
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
  const queryClient = useQueryClient();

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
    analyses,
    isCreatingAnalysis,
    isAiSdkStreaming,
    screenMode,
  } = useChatStore(useShallow(s => ({
    thread: s.thread,
    createdThreadId: s.createdThreadId,
    isCreatingThread: s.isCreatingThread,
    messages: s.messages,
    participants: s.participants,
    analyses: s.analyses,
    isCreatingAnalysis: s.isCreatingAnalysis,
    isAiSdkStreaming: s.isStreaming,
    screenMode: s.screenMode,
  })));

  // Actions (stable references - no need for useShallow)
  const createPendingAnalysis = useChatStore(s => s.createPendingAnalysis);
  // 🚨 ATOMIC: Use tryMarkAnalysisCreated to prevent race conditions
  const tryMarkAnalysisCreated = useChatStore(s => s.tryMarkAnalysisCreated);
  const completeStreaming = useChatStore(s => s.completeStreaming);

  // Track navigation state
  const [hasNavigated, setHasNavigated] = useState(false);

  // ============================================================================
  // BUILD FLOW CONTEXT
  // ============================================================================

  const context = useMemo((): FlowContext => {
    const threadId = thread?.id || createdThreadId;
    const currentRound
      = messages.length > 0 ? getCurrentRoundNumber(messages) : 0;

    // ✅ FIX: Check if analysis exists for CURRENT round, not ANY round
    const currentRoundAnalysis = analyses.find(
      a => a.roundNumber === currentRound,
    );

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
    // Don't count them as "responded" or analysis will trigger prematurely
    const completedMessagesInRound = participantMessagesInRound.filter((m) => {
      // Check for text content
      const hasTextContent = m.parts?.some(
        p => p.type === MessagePartTypes.TEXT && 'text' in p && p.text,
      );
      if (hasTextContent)
        return true;

      // Check for finishReason (streaming complete, even if empty due to error)
      const metadata = getAssistantMetadata(m.metadata);
      const finishReason = metadata?.finishReason;
      if (finishReason && finishReason !== FinishReasons.UNKNOWN)
        return true;

      return false;
    });

    const allParticipantsResponded
      = completedMessagesInRound.length >= participants.length
        && participants.length > 0;

    return {
      threadId,
      threadSlug: thread?.slug || null,
      hasAiGeneratedTitle: thread?.isAiGeneratedTitle ?? false,
      currentRound,
      hasMessages: messages.length > 0,
      participantCount: participants.length,
      allParticipantsResponded, // ✅ NEW: Round-specific participant completion
      analysisStatus: currentRoundAnalysis?.status || null,
      analysisExists: !!currentRoundAnalysis, // ✅ FIX: Round-specific check
      isAiSdkStreaming,
      isCreatingThread,
      isCreatingAnalysis,
      hasNavigated,
      screenMode,
    };
  }, [
    thread,
    createdThreadId,
    messages,
    participants,
    analyses,
    isAiSdkStreaming,
    isCreatingThread,
    isCreatingAnalysis,
    hasNavigated,
    screenMode,
  ]);

  // ============================================================================
  // COMPUTE CURRENT STATE
  // ============================================================================

  const flowState = useMemo(() => determineFlowState(context), [context]);
  // Initialize prevState as idle instead of current flowState
  // This ensures we detect the transition TO creating_analysis even if component
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
        case 'CREATE_ANALYSIS': {
          // Create pending analysis when participants finish
          const { threadId, currentRound } = context;

          if (threadId && messages.length > 0) {
            // 🚨 ATOMIC: tryMarkAnalysisCreated returns false if already created
            // This prevents race condition where multiple components try to create analysis simultaneously
            if (!tryMarkAnalysisCreated(currentRound)) {
              completeStreaming();
              break; // Analysis already created by another component, skip
            }

            // ✅ ENUM PATTERN: Use MessageRoles constant instead of hardcoded string
            const userMessage = messages.findLast(
              (m: UIMessage) => m.role === MessageRoles.USER,
            );
            // ✅ TYPE-SAFE: Use AI SDK TextPart type for text content extraction
            // ✅ ENUM PATTERN: Use MessagePartTypes constant instead of hardcoded string
            const userQuestion
              = userMessage?.parts?.find((p): p is TextPart => {
                return (
                  typeof p === 'object'
                  && p !== null
                  && 'type' in p
                  && p.type === MessagePartTypes.TEXT
                  && 'text' in p
                  && typeof p.text === 'string'
                );
              })?.text || '';

            createPendingAnalysis({
              roundNumber: currentRound,
              messages,
              userQuestion,
              threadId,
              mode: thread?.mode || DEFAULT_CHAT_MODE,
            });
            completeStreaming();
          }
          break;
        }

        case 'INVALIDATE_CACHE': {
          // Invalidate cache before navigation
          if (context.threadId) {
            queryClient.invalidateQueries({
              queryKey: queryKeys.threads.analyses(context.threadId),
            });
          }

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
          // - All data (messages, analyses, etc.) is in Zustand store
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
    queryClient,
    tryMarkAnalysisCreated,
    createPendingAnalysis,
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
