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
import { useRouter } from 'next/navigation';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';

import { AnalysisStatuses, MessagePartTypes, MessageRoles } from '@/api/core/enums';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { queryKeys } from '@/lib/data/query-keys';
import { getRoundNumber } from '@/lib/utils/metadata';
import { getCurrentRoundNumber } from '@/lib/utils/round-utils';

// ============================================================================
// FLOW STATE MACHINE TYPES
// ============================================================================

/**
 * Flow states represent the current stage of the conversation flow
 * Each state has clear entry/exit conditions and determines loading indicators
 */
export type FlowState
  = | 'idle' // No active operations
    | 'creating_thread' // POST /threads in progress
    | 'streaming_participants' // AI SDK streaming responses
    | 'creating_analysis' // Creating pending analysis record
    | 'streaming_analysis' // Analysis SSE streaming
    | 'completing' // Cleanup and finalization
    | 'navigating' // Router transition to thread screen
    | 'complete'; // Flow finished successfully

/**
 * Flow context contains all data needed to determine state transitions
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
  allParticipantsResponded: boolean; // ✅ NEW: All participants responded for current round

  // Analysis state
  analysisStatus: typeof AnalysisStatuses[keyof typeof AnalysisStatuses] | null;
  analysisExists: boolean;

  // SDK state
  isAiSdkStreaming: boolean;

  // Flags
  isCreatingThread: boolean;
  isCreatingAnalysis: boolean;
  hasNavigated: boolean;

  // Screen mode
  screenMode: 'overview' | 'thread' | 'public' | null;
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
    return 'complete';
  }

  // Priority 2: Ready to navigate (analysis done + title ready)
  // ✅ FIX: Only navigate in overview mode - thread screen already at destination
  if (
    context.screenMode === 'overview'
    && context.analysisStatus === AnalysisStatuses.COMPLETE
    && context.hasAiGeneratedTitle
    && context.threadSlug
  ) {
    return 'navigating';
  }

  // Priority 3: Analysis streaming
  // ✅ FIX: Also consider analysis streaming if analysis exists and AI SDK is streaming
  // This handles race condition where status hasn't been updated to 'streaming' yet
  if (
    context.analysisStatus === AnalysisStatuses.STREAMING
    || (context.analysisExists && context.isAiSdkStreaming)
  ) {
    return 'streaming_analysis';
  }

  // Priority 4: Creating analysis (participants done, no analysis yet)
  // ✅ FIX: Check if all participants responded for CURRENT round before creating analysis
  if (
    !context.isAiSdkStreaming
    && context.allParticipantsResponded // ✅ NEW: All participants must respond for current round
    && context.participantCount > 0
    && !context.analysisExists // ✅ Already fixed: Checks current round
    && !context.isCreatingAnalysis
  ) {
    return 'creating_analysis';
  }

  // Priority 5: Participants streaming
  // ✅ FIX: Only return streaming_participants if no analysis exists yet
  // Once analysis exists and isAiSdkStreaming is true, that's analysis streaming (Priority 3),
  // not participant streaming. This prevents falling back to streaming_participants during analysis.
  if (context.isAiSdkStreaming && !context.analysisExists) {
    return 'streaming_participants';
  }

  // Priority 6: Thread creation
  if (context.isCreatingThread) {
    return 'creating_thread';
  }

  // Default: Idle
  return 'idle';
}

/**
 * Determines if any loading indicator should be shown
 * SINGLE SOURCE OF TRUTH for loading state
 */
function shouldShowLoading(state: FlowState): boolean {
  return state !== 'idle' && state !== 'complete';
}

/**
 * Gets user-facing loading message for current state
 */
function getLoadingMessage(state: FlowState): string {
  switch (state) {
    case 'creating_thread':
      return 'Creating conversation...';
    case 'streaming_participants':
      return 'AI models responding...';
    case 'creating_analysis':
      return 'Preparing analysis...';
    case 'streaming_analysis':
      return 'Analyzing responses...';
    case 'completing':
      return 'Finalizing...';
    case 'navigating':
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
  // ✅ FIX: Trigger CREATE_ANALYSIS from any previous state (not just streaming_participants)
  // This handles race condition where streaming finishes before component mounts
  if (
    currentState === 'creating_analysis'
    && prevState !== 'creating_analysis'
    && context.threadId
  ) {
    return { type: 'CREATE_ANALYSIS' };
  }

  // Transition: creating_analysis → streaming_analysis (handled by analysis component)
  // No action needed here

  // Transition: streaming_analysis → navigating (cache invalidation)
  // ✅ PRIORITY 1: Invalidate cache BEFORE navigating
  if (
    prevState === 'streaming_analysis'
    && currentState === 'navigating'
    && context.threadSlug
    && !context.hasNavigated
  ) {
    return { type: 'INVALIDATE_CACHE' };
  }

  // Transition: * → navigating (navigation execution)
  // ✅ PRIORITY 2: Execute navigation when in navigating state and not yet navigated
  // Handles both:
  // 1. Direct jump to navigating (prevState !== 'navigating')
  // 2. After cache invalidation (prevState === 'navigating', currentState === 'navigating')
  if (currentState === 'navigating' && !context.hasNavigated && context.threadSlug) {
    // Skip if we just returned INVALIDATE_CACHE (will be handled in next effect run)
    if (prevState === 'streaming_analysis') {
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
  mode: 'overview' | 'thread' | 'public';
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
  const router = useRouter();

  // ============================================================================
  // GATHER CONTEXT FROM STORE
  // ============================================================================

  // Thread state
  const thread = useChatStore(s => s.thread);
  const createdThreadId = useChatStore(s => s.createdThreadId);
  const isCreatingThread = useChatStore(s => s.isCreatingThread);

  // Message/participant state
  const messages = useChatStore(s => s.messages);
  const participants = useChatStore(s => s.participants);

  // Analysis state
  const analyses = useChatStore(s => s.analyses);
  const isCreatingAnalysis = useChatStore(s => s.isCreatingAnalysis);

  // AI SDK state
  const isAiSdkStreaming = useChatStore(s => s.isStreaming);

  // Store actions
  const createPendingAnalysis = useChatStore(s => s.createPendingAnalysis);
  const markAnalysisCreated = useChatStore(s => s.markAnalysisCreated);
  const hasAnalysisBeenCreated = useChatStore(s => s.hasAnalysisBeenCreated);
  const completeStreaming = useChatStore(s => s.completeStreaming);

  // Track navigation state
  const [hasNavigated, setHasNavigated] = useState(false);

  // ============================================================================
  // BUILD FLOW CONTEXT
  // ============================================================================

  // Get screen mode from store
  const screenMode = useChatStore(s => s.screenMode);

  const context = useMemo((): FlowContext => {
    const threadId = thread?.id || createdThreadId;
    const currentRound = messages.length > 0 ? getCurrentRoundNumber(messages) : 0;

    // ✅ FIX: Check if analysis exists for CURRENT round, not ANY round
    const currentRoundAnalysis = analyses.find(a => a.roundNumber === currentRound);

    // ✅ FIX: Count participant messages for CURRENT round only
    // ✅ TYPE-SAFE: Use extraction utility instead of manual metadata access
    // ✅ ENUM PATTERN: Use MessageRoles constant instead of hardcoded string
    const participantMessagesInRound = messages.filter((m) => {
      return m.role === MessageRoles.ASSISTANT && getRoundNumber(m.metadata) === currentRound;
    });
    const allParticipantsResponded = participantMessagesInRound.length >= participants.length && participants.length > 0;

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
  // ✅ FIX: Initialize prevState as 'idle' instead of current flowState
  // This ensures we detect the transition TO creating_analysis even if component
  // mounts after streaming has finished (fast streaming race condition)
  const prevStateRef = useRef<FlowState>('idle');

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
            // ✅ CRITICAL FIX: Check if analysis already created before proceeding
            // Prevents duplicate analysis creation when both provider and flow-state-machine trigger
            if (hasAnalysisBeenCreated(currentRound)) {
              completeStreaming();
              break; // Analysis already created, skip
            }

            // ✅ ENUM PATTERN: Use MessageRoles constant instead of hardcoded string
            const userMessage = messages.findLast((m: UIMessage) => m.role === MessageRoles.USER);
            // ✅ TYPE-SAFE: Use AI SDK TextPart type for text content extraction
            // ✅ ENUM PATTERN: Use MessagePartTypes constant instead of hardcoded string
            const userQuestion = userMessage?.parts
              ?.find((p): p is TextPart => {
                return (
                  typeof p === 'object'
                  && p !== null
                  && 'type' in p
                  && p.type === MessagePartTypes.TEXT
                  && 'text' in p
                  && typeof p.text === 'string'
                );
              })
              ?.text || '';

            markAnalysisCreated(currentRound);
            createPendingAnalysis({
              roundNumber: currentRound,
              messages,
              participants,
              userQuestion,
              threadId,
              mode: thread?.mode || 'analyzing',
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

          // After invalidating cache, execute navigation in same effect run
          // This handles the streaming_analysis → navigating transition where we need both actions
          if (mode === 'overview' && context.threadSlug && !context.hasNavigated) {
            const slug = context.threadSlug; // Capture for closure
            startTransition(() => {
              setHasNavigated(true);
              queueMicrotask(() => {
                router.push(`/chat/${slug}`);
              });
            });
          }
          break;
        }

        case 'NAVIGATE': {
          // Execute navigation
          if (mode === 'overview' && action.slug) {
            startTransition(() => {
              setHasNavigated(true);
              queueMicrotask(() => {
                router.push(`/chat/${action.slug}`);
              });
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
    router,
    markAnalysisCreated,
    hasAnalysisBeenCreated,
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
