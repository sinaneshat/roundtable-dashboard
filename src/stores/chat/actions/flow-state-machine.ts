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
import { useRouter } from 'next/navigation';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';

import { AnalysisStatuses } from '@/api/core/enums';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { queryKeys } from '@/lib/data/query-keys';
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

  // Analysis state
  analysisStatus: typeof AnalysisStatuses[keyof typeof AnalysisStatuses] | null;
  analysisExists: boolean;

  // SDK state
  isAiSdkStreaming: boolean;

  // Flags
  isCreatingThread: boolean;
  isCreatingAnalysis: boolean;
  hasNavigated: boolean;
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
  if (
    context.analysisStatus === AnalysisStatuses.COMPLETE
    && context.hasAiGeneratedTitle
    && context.threadSlug
  ) {
    return 'navigating';
  }

  // Priority 3: Analysis streaming
  if (context.analysisStatus === AnalysisStatuses.STREAMING) {
    return 'streaming_analysis';
  }

  // Priority 4: Creating analysis (participants done, no analysis yet)
  if (
    !context.isAiSdkStreaming
    && context.hasMessages
    && context.participantCount > 0
    && !context.analysisExists
    && !context.isCreatingAnalysis
  ) {
    return 'creating_analysis';
  }

  // Priority 5: Participants streaming
  if (context.isAiSdkStreaming) {
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

  // Transition: streaming_participants → creating_analysis
  if (
    prevState === 'streaming_participants'
    && currentState === 'creating_analysis'
    && context.threadId
  ) {
    return { type: 'CREATE_ANALYSIS' };
  }

  // Transition: creating_analysis → streaming_analysis (handled by analysis component)
  // No action needed here

  // Transition: streaming_analysis → navigating
  if (
    prevState === 'streaming_analysis'
    && currentState === 'navigating'
    && context.threadSlug
  ) {
    return { type: 'INVALIDATE_CACHE' };
  }

  // Transition: navigating → complete
  if (prevState === 'navigating' && currentState === 'navigating' && !context.hasNavigated) {
    return { type: 'NAVIGATE', slug: context.threadSlug! };
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
  const completeStreaming = useChatStore(s => s.completeStreaming);

  // Track navigation state
  const [hasNavigated, setHasNavigated] = useState(false);

  // ============================================================================
  // BUILD FLOW CONTEXT
  // ============================================================================

  const context = useMemo((): FlowContext => {
    const threadId = thread?.id || createdThreadId;
    const currentRound = messages.length > 0 ? getCurrentRoundNumber(messages) : 0;
    const firstAnalysis = analyses[0];

    return {
      threadId,
      threadSlug: thread?.slug || null,
      hasAiGeneratedTitle: thread?.isAiGeneratedTitle ?? false,
      currentRound,
      hasMessages: messages.length > 0,
      participantCount: participants.length,
      analysisStatus: firstAnalysis?.status || null,
      analysisExists: analyses.length > 0,
      isAiSdkStreaming,
      isCreatingThread,
      isCreatingAnalysis,
      hasNavigated,
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
  ]);

  // ============================================================================
  // COMPUTE CURRENT STATE
  // ============================================================================

  const flowState = useMemo(() => determineFlowState(context), [context]);
  const prevStateRef = useRef<FlowState>(flowState);

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
            const userMessage = messages.findLast(m => m.role === 'user');
            const userQuestion = userMessage?.parts
              ?.find(p => p.type === 'text' && 'text' in p)
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
