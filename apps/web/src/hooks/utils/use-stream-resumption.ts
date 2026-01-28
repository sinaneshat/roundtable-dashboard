/**
 * Stream Resumption Hook - Backend-First Architecture
 *
 * Detects in-progress rounds on page load/refresh by querying backend KV state.
 * Per FLOW_DOCUMENTATION.md: Backend is source of truth for round execution state.
 *
 * Problem this solves:
 * - When user refreshes mid-round, frontend has no idea round is in progress
 * - Store initializes with phase='complete' based on messages.length > 0
 * - Subscriptions never enable because phase isn't 'participants'/'moderator'
 *
 * Solution:
 * - Fetch backend resumption state on mount
 * - If in-progress round detected, return state for store to hydrate
 * - Store creates placeholders and enables subscriptions
 */

import type { StreamResumptionStatus } from '@roundtable/shared/enums';
import { RoundPhases, StreamResumptionStatuses } from '@roundtable/shared/enums';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { rlog } from '@/lib/utils/dev-logger';
import type { ThreadStreamResumptionState } from '@/services/api/chat';
import { getThreadStreamResumptionStateService } from '@/services/api/chat';

// Re-export for backwards compatibility
export type { StreamResumptionStatus } from '@roundtable/shared/enums';

// ============================================================================
// TYPES
// ============================================================================

export type StreamResumptionResult = {
  /** Current status of the resumption check */
  status: StreamResumptionStatus;
  /** Backend resumption state (null if idle/checking/error) */
  state: ThreadStreamResumptionState | null;
  /** Whether an in-progress round was detected */
  hasInProgressRound: boolean;
  /** Error message if check failed */
  error: string | null;
  /** Retry the resumption check */
  retry: () => void;
};

export type UseStreamResumptionOptions = {
  /** Thread ID to check resumption state for */
  threadId: string | null;
  /** Whether resumption check is enabled */
  enabled?: boolean;
  /** Skip if store is already in an active streaming phase */
  skipIfActivePhase?: boolean;
  /** Current store phase (used with skipIfActivePhase) */
  currentPhase?: string;
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Check if backend phase indicates an in-progress round
 * Per FLOW_DOCUMENTATION.md phases: idle → pre_search → participants → moderator → complete
 * Uses lowercase values from RoundPhases constant
 */
function isInProgressPhase(phase: string | null | undefined): boolean {
  if (!phase) {
    return false;
  }
  return (
    phase === RoundPhases.PRE_SEARCH
    || phase === RoundPhases.PARTICIPANTS
    || phase === RoundPhases.MODERATOR
  );
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook to detect and resume in-progress streaming rounds on page load.
 *
 * Usage in ChatStoreProvider:
 * ```tsx
 * const { state, hasInProgressRound } = useStreamResumption({
 *   threadId: effectiveThreadId,
 *   enabled: hasInitiallyLoaded && !isStreaming,
 * });
 *
 * useEffect(() => {
 *   if (hasInProgressRound && state) {
 *     store.getState().resumeInProgressRound(state);
 *   }
 * }, [hasInProgressRound, state, store]);
 * ```
 */
export function useStreamResumption({
  currentPhase,
  enabled = true,
  skipIfActivePhase = true,
  threadId,
}: UseStreamResumptionOptions): StreamResumptionResult {
  const [status, setStatus] = useState<StreamResumptionStatus>('idle');
  const [state, setState] = useState<ThreadStreamResumptionState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track which thread we've checked to avoid duplicate checks
  const checkedThreadIdRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  // Track previous enabled state to log only on changes
  const prevEnabledRef = useRef<boolean | null>(null);

  const checkResumption = useCallback(async (tid: string) => {
    if (!isMountedRef.current) {
      return;
    }

    rlog.resume('hook-fetch', `tid=${tid.slice(-8)} FETCHING backend state`);
    setStatus('checking');
    setError(null);

    try {
      const response = await getThreadStreamResumptionStateService({
        param: { threadId: tid },
      });

      if (!isMountedRef.current) {
        return;
      }

      rlog.resume('hook-response', `tid=${tid.slice(-8)} raw response: ${JSON.stringify(response).slice(0, 200)}`);

      if (!response || !('data' in response) || !response.data) {
        rlog.resume('hook-empty', `tid=${tid.slice(-8)} no response or no data`);
        setStatus('complete');
        setState(null);
        return;
      }

      // API returns { success: true, data: ThreadStreamResumptionState }
      // Type is already inferred via Hono RPC - no casting needed
      const resumptionState = response.data;
      const isInProgress = isInProgressPhase(resumptionState.currentPhase);

      rlog.resume('hook-parsed', `tid=${tid.slice(-8)} phase=${resumptionState.currentPhase} inProgress=${isInProgress} round=${resumptionState.roundNumber} hasStream=${resumptionState.hasActiveStream} total=${resumptionState.totalParticipants} nextP=${resumptionState.nextParticipantToTrigger} allComplete=${resumptionState.participants?.allComplete}`);

      if (isInProgress) {
        rlog.resume('in-progress-detected', `tid=${tid.slice(-8)} r${resumptionState.roundNumber} phase=${resumptionState.currentPhase} - will resume`);
      }

      setState(resumptionState);
      setStatus('complete');
      checkedThreadIdRef.current = tid;
    } catch (err) {
      if (!isMountedRef.current) {
        return;
      }

      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      rlog.stuck('resume-check', `tid=${tid.slice(-8)} error: ${errorMsg}`);
      setError(errorMsg);
      setStatus('error');
    }
  }, []);

  const retry = useCallback(() => {
    if (threadId) {
      checkedThreadIdRef.current = null; // Reset to allow re-check
      checkResumption(threadId);
    }
  }, [threadId, checkResumption]);

  // Check resumption state on mount/thread change
  useEffect(() => {
    isMountedRef.current = true;

    // Log only when enabled state changes (not on every render)
    if (prevEnabledRef.current !== enabled && threadId) {
      if (enabled && prevEnabledRef.current === false) {
        // Only log when transitioning from disabled to enabled
        rlog.resume('hook-enabled', `tid=${threadId.slice(-8)} resumption check now enabled`);
      }
      prevEnabledRef.current = enabled;
    }

    // Early exits - no logging needed for normal guard behavior
    if (!threadId) {
      return;
    }
    if (!enabled) {
      return;
    }
    if (checkedThreadIdRef.current === threadId) {
      return;
    }

    // Skip if already in active streaming phase (compute only when needed)
    if (skipIfActivePhase && (
      currentPhase === 'participants'
      || currentPhase === 'moderator'
      || currentPhase === 'presearch'
    )) {
      return;
    }

    checkResumption(threadId);

    return () => {
      isMountedRef.current = false;
    };
  }, [threadId, enabled, skipIfActivePhase, currentPhase, checkResumption]);

  // Reset state when thread changes
  // Using useLayoutEffect to ensure synchronous state reset before render
  useLayoutEffect(() => {
    if (threadId !== checkedThreadIdRef.current && status !== StreamResumptionStatuses.CHECKING) {
      setState(null);
      setError(null);
      setStatus(StreamResumptionStatuses.IDLE);
    }
  }, [threadId, status]);

  const hasInProgressRound = status === StreamResumptionStatuses.COMPLETE && state !== null && isInProgressPhase(state.currentPhase);

  // Track if we've already logged finding an in-progress round for this thread
  // This prevents spamming the log on every render
  const hasLoggedInProgressRef = useRef<string | null>(null);
  const logKey = threadId ? `${threadId}_${state?.currentPhase}` : null;

  if (hasInProgressRound && logKey && hasLoggedInProgressRef.current !== logKey) {
    rlog.resume('hook-result', `Found in-progress round: phase=${state?.currentPhase}`);
    hasLoggedInProgressRef.current = logKey;
  }

  return {
    error,
    hasInProgressRound,
    retry,
    state,
    status,
  };
}
