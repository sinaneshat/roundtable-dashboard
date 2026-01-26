/**
 * Round Orchestrator Hook - FSM-based round flow coordination
 *
 * This hook implements the finite state machine for round orchestration.
 * It coordinates pre-search → participants → moderator flow using explicit
 * state transitions rather than reactive effects.
 *
 * ✅ PATTERN: FSM-driven - explicit states and transitions, no implicit triggers
 * ✅ DETERMINISTIC: Same inputs → same state transitions
 * ✅ TESTABLE: Pure transition functions, isolated action execution
 *
 * Replaces: use-streaming-trigger, use-round-resumption, use-pending-message,
 *           use-stale-streaming-cleanup, use-stuck-stream-detection
 */

import type { RoundFlowEvent } from '@roundtable/shared';
import { useCallback, useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { rlog } from '@/lib/utils/dev-logger';
import type { ChatStoreApi } from '@/stores/chat';
import type { EventPayload, RoundContext, RoundFlowAction } from '@/stores/chat/machine';
import {
  buildContext,
  transition,
} from '@/stores/chat/machine';

import type { ChatHook } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export type UseRoundOrchestratorParams = {
  store: ChatStoreApi;
  chat: ChatHook;
  effectiveThreadId: string;
};

export type RoundOrchestratorResult = {
  /** Dispatch an FSM event to trigger a state transition */
  dispatch: (event: RoundFlowEvent, payload?: EventPayload) => void;
  /** Current FSM state */
  flowState: string;
  /** Get current FSM context snapshot */
  getContext: () => RoundContext;
};

// ============================================================================
// ACTION EXECUTOR
// ============================================================================

/**
 * Execute an action returned by the FSM transition
 * Actions are side effects that should be performed after state transition
 */
function executeAction(
  action: RoundFlowAction,
  deps: {
    store: ChatStoreApi;
    chat: ChatHook;
    effectiveThreadId: string;
    dispatch: (event: RoundFlowEvent, payload?: EventPayload) => void;
  },
): void {
  const { chat, dispatch, store } = deps;

  switch (action.type) {
    case 'CREATE_PRE_SEARCH':
      rlog.phase('fsm-action', `CREATE_PRE_SEARCH r${action.roundNumber}`);
      // Pre-search creation will be handled by existing services
      // The FSM triggers the action, orchestration layer executes
      break;

    case 'RESUME_PRE_SEARCH':
      rlog.phase('fsm-action', `RESUME_PRE_SEARCH stream=${action.streamId}`);
      // Resume existing pre-search stream
      break;

    case 'START_PARTICIPANT':
      rlog.phase('fsm-action', `START_PARTICIPANT idx=${action.index} isResumption=${action.isResumption}`);
      // Use AI SDK to start participant streaming
      if (chat.startRound) {
        store.getState().setFlowParticipantIndex(action.index);
        // AI SDK startRound will be called by the orchestration layer
        queueMicrotask(() => {
          chat.startRound?.();
          // After streaming starts, FSM needs to be notified
          // This will come from AI SDK onFinish callback
        });
      }
      break;

    case 'SET_PARTICIPANT_INDEX':
      rlog.phase('fsm-action', `SET_PARTICIPANT_INDEX idx=${action.index}`);
      store.getState().setFlowParticipantIndex(action.index);
      break;

    case 'ADVANCE_TO_NEXT_PARTICIPANT': {
      rlog.phase('fsm-action', `ADVANCE_TO_NEXT_PARTICIPANT from=${action.currentIndex}`);
      const nextIndex = action.currentIndex + 1;
      store.getState().setFlowParticipantIndex(nextIndex);
      // Auto-dispatch PARTICIPANT_START for next participant
      queueMicrotask(() => {
        dispatch('PARTICIPANT_START', { participantIndex: nextIndex });
      });
      break;
    }

    case 'START_MODERATOR':
      rlog.phase('fsm-action', `START_MODERATOR r${action.roundNumber}`);
      // Moderator trigger will be handled by existing hook
      // FSM just signals it's time to start moderator
      break;

    case 'RESUME_MODERATOR':
      rlog.phase('fsm-action', `RESUME_MODERATOR stream=${action.streamId}`);
      // Resume existing moderator stream
      break;

    case 'COMPLETE_ROUND':
      rlog.phase('fsm-action', `COMPLETE_ROUND r${action.roundNumber}`);
      store.getState().setFlowRoundNumber(action.roundNumber);
      // Round completion cleanup
      break;

    case 'NOTIFY_COMPLETION':
      rlog.phase('fsm-action', `NOTIFY_COMPLETION r${action.roundNumber}`);
      // Notify external systems of round completion
      break;

    case 'SKIP_PRE_SEARCH':
      rlog.phase('fsm-action', 'SKIP_PRE_SEARCH');
      // No pre-search needed, proceed to participants
      break;

    case 'SET_ERROR':
      rlog.phase('fsm-action', `SET_ERROR phase=${action.phase} msg=${action.error.message}`);
      store.getState().setFlowError(action.error);
      break;

    case 'RESET_FLOW':
      rlog.phase('fsm-action', 'RESET_FLOW');
      store.getState().resetFlowState();
      break;

    case 'UPDATE_STORE':
      rlog.phase('fsm-action', 'UPDATE_STORE');
      // Generic store updates handled by caller
      break;

    case 'CLEAR_TRACKING':
      rlog.phase('fsm-action', 'CLEAR_TRACKING');
      // Clear tracking state
      break;

    default:
      // TypeScript exhaustiveness check - this should never be reached
      // If it is, the action type discriminated union is incomplete
      rlog.phase('fsm-action', `UNKNOWN action type`);
  }
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useRoundOrchestrator({
  chat,
  effectiveThreadId,
  store,
}: UseRoundOrchestratorParams): RoundOrchestratorResult {
  // Track dispatch to prevent re-entrancy
  const isDispatchingRef = useRef(false);
  const pendingEventsRef = useRef<{ event: RoundFlowEvent; payload?: EventPayload }[]>([]);

  // Subscribe to FSM state from store
  const flowState = useStore(store, useShallow(s => s.flowState));

  /**
   * Build context from current store and AI SDK state
   */
  const getContext = useCallback((): RoundContext => {
    const state = store.getState();

    // Map store state to StoreSnapshot interface
    const storeSnapshot = {
      createdThreadId: state.createdThreadId,
      currentParticipantIndex: state.flowParticipantIndex,
      currentResumptionPhase: state.currentResumptionPhase,
      currentRoundNumber: state.currentRoundNumber,
      enableWebSearch: state.enableWebSearch,
      error: state.flowLastError,
      messages: state.messages.map(m => ({
        id: m.id,
        metadata: m.metadata as {
          roundNumber?: number;
          participantIndex?: number;
          isModerator?: boolean;
        } | undefined,
        role: m.role,
      })),
      moderatorResumption: state.moderatorResumption?.streamId
        ? { streamId: state.moderatorResumption.streamId }
        : null,
      nextParticipantToTrigger: state.nextParticipantToTrigger as [number, number] | null,
      participants: state.participants.map((p, idx) => ({
        enabled: true, // Participants in store are enabled
        id: p.id,
        participantIndex: idx,
      })),
      preSearches: state.preSearches.map(ps => ({
        id: ps.id,
        roundNumber: ps.roundNumber,
        status: ps.status,
      })),
      preSearchResumption: state.preSearchResumption?.streamId
        ? { streamId: state.preSearchResumption.streamId }
        : null,
      resumptionRoundNumber: state.resumptionRoundNumber,
      streamingRoundNumber: state.streamingRoundNumber,
      streamResumptionPrefilled: state.streamResumptionPrefilled,
      thread: state.thread,
    };

    // Get AI SDK state from chat hook
    const aiSdkSnapshot = {
      isReady: chat.isReady,
      isStreaming: chat.isStreaming,
    };

    return buildContext(storeSnapshot, aiSdkSnapshot);
  }, [store, chat.isStreaming, chat.isReady]);

  /**
   * Dispatch FSM event - triggers state transition and executes actions
   */
  const dispatch = useCallback((
    event: RoundFlowEvent,
    payload?: EventPayload,
  ) => {
    // Queue events if already dispatching to prevent re-entrancy
    if (isDispatchingRef.current) {
      pendingEventsRef.current.push({ event, payload });
      return;
    }

    isDispatchingRef.current = true;

    try {
      const state = store.getState();
      const currentFlowState = state.flowState;
      const ctx = getContext();

      rlog.phase('fsm-dispatch', `Event: ${event}, State: ${currentFlowState}`);

      // Run pure FSM transition
      const result = transition(currentFlowState, event, ctx, payload);

      // Update state if changed
      if (result.nextState !== currentFlowState) {
        rlog.phase('fsm-transition', `${currentFlowState} → ${result.nextState}`);
        store.getState().setFlowState(result.nextState);
      }

      // Record event in history
      store.getState().dispatchFlowEvent(event, payload);

      // Execute actions
      for (const action of result.actions) {
        executeAction(action, {
          chat,
          dispatch,
          effectiveThreadId,
          store,
        });
      }
    } finally {
      isDispatchingRef.current = false;

      // Process any events that were queued during dispatch
      while (pendingEventsRef.current.length > 0) {
        const next = pendingEventsRef.current.shift();
        if (next) {
          dispatch(next.event, next.payload);
        }
      }
    }
  }, [store, chat, effectiveThreadId, getContext]);

  /**
   * Listen for AI SDK completion to dispatch FSM events
   */
  useEffect(() => {
    // This effect will be enhanced to listen to AI SDK state changes
    // and dispatch appropriate FSM events (PARTICIPANT_COMPLETE, etc.)
    // For now, we rely on external orchestration to call dispatch
  }, []);

  /**
   * Subscribe to FSM state changes for logging/debugging
   */
  useEffect(() => {
    let prevFlowState = store.getState().flowState;

    const unsubscribe = store.subscribe((state) => {
      const newFlowState = state.flowState;
      if (newFlowState !== prevFlowState) {
        rlog.phase('fsm-state-change', `${prevFlowState} → ${newFlowState}`);
        prevFlowState = newFlowState;
      }
    });

    return unsubscribe;
  }, [store]);

  return {
    dispatch,
    flowState,
    getContext,
  };
}
