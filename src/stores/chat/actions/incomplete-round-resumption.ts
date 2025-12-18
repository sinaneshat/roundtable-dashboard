/**
 * Incomplete Round Resumption Hook
 *
 * Zustand v5 Pattern: Store-specific action hook co-located with store
 * Detects and resumes incomplete rounds when user navigates to a thread page.
 *
 * USE CASE:
 * When a user leaves a page during participant streaming and returns later:
 * - Some participants may have responded
 * - Other participants may not have had a chance to respond
 * - This hook detects incomplete rounds and triggers remaining participants
 *
 * ORPHANED PRE-SEARCH USE CASE (NEW):
 * When a user refreshes during pre-search/changelog phase:
 * - Pre-search for round N is complete
 * - But NO user message for round N exists (lost on refresh)
 * - This hook detects this state and recovers the userQuery from pre-search
 * - Sets pendingMessage to resume the round normally
 *
 * FLOW:
 * 1. On page load, check if current round has all expected participants
 * 2. ✅ FIX: Check backend for active streams BEFORE triggering new participants
 * 3. If incomplete and no active stream, determine which participant is next
 * 4. Set nextParticipantToTrigger in store
 * 5. Provider effect will detect this and trigger the participant
 *
 * IMPORTANT:
 * - ✅ FIX: This hook NOW checks for active streams via backend before triggering
 * - This prevents triggering new AI calls when a stream is being resumed by AI SDK
 * - Works for ALL scenarios: analyze, search, and participant streams
 *
 * Location: /src/stores/chat/actions/incomplete-round-resumption.ts
 * Used by: useScreenInitialization (internal composition)
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { FinishReasons, MessageRoles, MessageStatuses } from '@/api/core/enums';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { getAssistantMetadata, getParticipantIndex, getRoundNumber } from '@/lib/utils/metadata';
import { getEnabledParticipantModelIdSet, getEnabledParticipants, getParticipantModelIds } from '@/lib/utils/participant';
import { getCurrentRoundNumber } from '@/lib/utils/round-utils';

import {
  getParticipantCompletionStatus,
  isMessageComplete,
  logParticipantCompletionStatus,
} from '../utils/participant-completion-gate';
import { createOptimisticUserMessage } from '../utils/placeholder-factories';
import { getEffectiveWebSearchEnabled, shouldWaitForPreSearch } from '../utils/pre-search-execution';

// ============================================================================
// DEBUG: Debounced logger for resumption debugging
// ============================================================================
const debugLogTimers: Record<string, NodeJS.Timeout> = {};
function debugLog(key: string, data: Record<string, unknown>, debounceMs = 500) {
  // eslint-disable-next-line antfu/if-newline
  if (debugLogTimers[key]) clearTimeout(debugLogTimers[key]);
  debugLogTimers[key] = setTimeout(() => {
    // Intentionally empty - debug logging removed
  }, debounceMs);
}

// ============================================================================
// AI SDK RESUME PATTERN - NO SEPARATE /resume CALL NEEDED
// ============================================================================
// Per AI SDK docs (https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-resume-streams):
// - useChat with `resume: true` automatically calls GET /stream on mount
// - GET /stream returns 204 (no stream) or 200 with SSE (resume stream)
// - NO separate /resume endpoint is needed
//
// Pending round recovery is handled via:
// - GET /stream includes pending round info in 204 response headers
// - OR separately on page load from server-side data
// ============================================================================

export type UseIncompleteRoundResumptionOptions = {
  /**
   * Thread ID to check for incomplete rounds
   */
  threadId: string;

  /**
   * Enable/disable the resumption check
   */
  enabled?: boolean;
};

export type UseIncompleteRoundResumptionReturn = {
  /**
   * Whether the current round is incomplete
   */
  isIncomplete: boolean;

  /**
   * Index of the next participant that needs to speak
   */
  nextParticipantIndex: number | null;

  /**
   * The round number being resumed (if any)
   */
  resumingRoundNumber: number | null;

  /**
   * ✅ UNIFIED PHASES: Current phase being resumed (if any)
   * - 'pre_search': Resuming pre-search/web search phase
   * - 'participants': Resuming participant streaming phase
   * - 'summarizer': Resuming round summary phase
   * - null: No phase resumption in progress
   */
  currentResumptionPhase: 'idle' | 'pre_search' | 'participants' | 'summarizer' | 'complete' | null;
};

/**
 * Hook for detecting and resuming incomplete rounds
 *
 * This hook runs on mount and checks if the current round has all expected
 * participant responses. If not, it sets up the store state to trigger
 * the remaining participants.
 *
 * @example
 * const { isIncomplete, nextParticipantIndex } = useIncompleteRoundResumption({
 *   threadId: thread.id,
 *   enabled: !isStreaming && !!thread
 * })
 */
export function useIncompleteRoundResumption(
  options: UseIncompleteRoundResumptionOptions,
): UseIncompleteRoundResumptionReturn {
  const { threadId, enabled = true } = options;

  // ============================================================================
  // ✅ REACT 19 PATTERN: Batched store selectors with useShallow
  // Reduces re-renders by batching related state subscriptions
  // ============================================================================

  // State subscriptions (batched)
  const {
    messages,
    participants,
    preSearches,
    summaries, // ✅ UNIFIED PHASES: Need summaries for summarizer resumption
    isStreaming,
    waitingToStartStreaming,
    pendingMessage,
    hasSentPendingMessage,
    hasEarlyOptimisticMessage,
    enableWebSearch,
    thread,
    // ✅ UNIFIED PHASES: Phase-based resumption state from server prefill
    currentResumptionPhase,
    preSearchResumption,
    summarizerResumption,
    resumptionRoundNumber,
    streamResumptionPrefilled,
    isCreatingSummary,
  } = useChatStore(useShallow(s => ({
    messages: s.messages,
    participants: s.participants,
    preSearches: s.preSearches,
    summaries: s.summaries, // ✅ UNIFIED PHASES: Need summaries for summarizer resumption
    isStreaming: s.isStreaming,
    waitingToStartStreaming: s.waitingToStartStreaming,
    pendingMessage: s.pendingMessage,
    hasSentPendingMessage: s.hasSentPendingMessage,
    hasEarlyOptimisticMessage: s.hasEarlyOptimisticMessage,
    enableWebSearch: s.enableWebSearch,
    thread: s.thread,
    // ✅ UNIFIED PHASES: Phase-based resumption state from server prefill
    currentResumptionPhase: s.currentResumptionPhase,
    preSearchResumption: s.preSearchResumption,
    summarizerResumption: s.summarizerResumption,
    resumptionRoundNumber: s.resumptionRoundNumber,
    streamResumptionPrefilled: s.streamResumptionPrefilled,
    isCreatingSummary: s.isCreatingSummary,
  })));

  // Actions - batched with useShallow for stable reference
  const actions = useChatStore(useShallow(s => ({
    setNextParticipantToTrigger: s.setNextParticipantToTrigger,
    setStreamingRoundNumber: s.setStreamingRoundNumber,
    setCurrentParticipantIndex: s.setCurrentParticipantIndex,
    setWaitingToStartStreaming: s.setWaitingToStartStreaming,
    setIsStreaming: s.setIsStreaming,
    prepareForNewMessage: s.prepareForNewMessage,
    setExpectedParticipantIds: s.setExpectedParticipantIds,
    setMessages: s.setMessages,
    setIsWaitingForChangelog: s.setIsWaitingForChangelog,
    // ✅ UNIFIED PHASES: Actions for phase-based resumption
    clearStreamResumption: s.clearStreamResumption,
    setIsCreatingSummary: s.setIsCreatingSummary,
    // ✅ PHASE TRANSITION FIX: Clear pre-search state when transitioning
    transitionToParticipantsPhase: s.transitionToParticipantsPhase,
  })));

  // ============================================================================
  // REF DECLARATIONS (grouped for consolidated reset effect)
  // ============================================================================
  const resumptionAttemptedRef = useRef<string | null>(null);
  const orphanedPreSearchRecoveryAttemptedRef = useRef<string | null>(null);
  const orphanedPreSearchUIRecoveryRef = useRef<string | null>(null);
  const activeStreamCheckRef = useRef<string | null>(null);
  // ✅ FIX: Use state instead of ref for activeStreamCheckComplete
  // Refs don't trigger re-renders, so the main resumption effect never re-runs
  // after the 100ms timeout sets the ref. Using state ensures re-render.
  const [activeStreamCheckComplete, setActiveStreamCheckComplete] = useState(false);
  // ✅ UNIFIED PHASES: Phase-based resumption tracking
  const preSearchPhaseResumptionAttemptedRef = useRef<string | null>(null);
  const summarizerPhaseResumptionAttemptedRef = useRef<string | null>(null);
  // ✅ FAILED TRIGGER RECOVERY: Track trigger state for retry detection
  const wasWaitingRef = useRef(false);
  const sawStreamingRef = useRef(false);

  // Calculate incomplete round state (moved up for use in pending round recovery)
  const enabledParticipants = getEnabledParticipants(participants);

  // ============================================================================
  // AI SDK RESUME PATTERN - NO SEPARATE /resume CALL
  // ============================================================================
  // Per AI SDK docs, useChat with `resume: true` automatically handles stream
  // resumption via GET /stream endpoint. No separate /resume call needed.
  //
  // Pending round recovery (if needed) is handled via:
  // - GET /stream includes pending round info in 204 response headers
  // - The AI SDK calls this automatically on mount when resume: true
  // ============================================================================

  // ============================================================================
  // ✅ STALE STATE FIX: Clear waitingToStartStreaming on page refresh
  // When user refreshes during submission flow:
  // 1. waitingToStartStreaming: true persists (via Zustand persist)
  // 2. But pendingMessage: null (not persisted or cleared)
  // 3. This causes a deadlock - nothing triggers streaming
  //
  // Detection: waitingToStartStreaming: true AND pendingMessage: null AND !isStreaming
  // Fix: Clear waitingToStartStreaming so incomplete round resumption can work
  //
  // ✅ RACE CONDITION FIX: Only check ONCE on mount, not on subsequent renders
  // Previously, if the resumption effect set waitingToStartStreaming=true AFTER this
  // effect first ran, this effect would re-run (dependency changed) and incorrectly
  // clear the flag, preventing resumption from triggering.
  // Fix: Set the ref immediately on first run to prevent subsequent checks.
  // ============================================================================
  const staleWaitingStateRef = useRef(false);

  useEffect(() => {
    // ✅ RACE CONDITION FIX: Mark as checked IMMEDIATELY on first run
    // This prevents the effect from re-running when resumption hook sets
    // waitingToStartStreaming=true, which would incorrectly clear the flag.
    // The stale state check should ONLY happen on initial mount.
    if (staleWaitingStateRef.current) {
      return;
    }
    // Mark as checked BEFORE evaluating condition (not after)
    staleWaitingStateRef.current = true;

    // ✅ PREFILL FIX: Don't clear state if it was just prefilled from server
    // When prefillStreamResumptionState runs, it sets waitingToStartStreaming=true
    // and streamResumptionPrefilled=true. This is NOT stale state - it's fresh
    // resumption state that should be preserved for the resumption effects to handle.
    if (streamResumptionPrefilled) {
      return;
    }

    // Detect stale state: waiting but no pending message and not streaming
    // This only fires if waitingToStartStreaming was ALREADY true at mount time
    // (leftover from crashed session), not if resumption hook just set it
    if (waitingToStartStreaming && pendingMessage === null && !isStreaming) {
      // ✅ RACE CONDITION FIX: Clear ALL related stale state, not just waitingToStartStreaming
      // Previously only cleared waitingToStartStreaming, leaving nextParticipantToTrigger set.
      // This caused provider effect to see nextParticipantToTrigger=0 but waitingToStart=false,
      // which doesn't match any condition and leaves the system stuck.
      // Clear everything to ensure consistent state.
      actions.setWaitingToStartStreaming(false);
      actions.setNextParticipantToTrigger(null);
      actions.setStreamingRoundNumber(null);
      actions.setCurrentParticipantIndex(0);
    }
  }, [waitingToStartStreaming, pendingMessage, isStreaming, streamResumptionPrefilled, actions]);

  // ============================================================================
  // ✅ STALE isStreaming FIX: Clear stale isStreaming on page refresh
  // ============================================================================
  // When user refreshes during streaming:
  // 1. isStreaming: true persists from previous session
  // 2. AI SDK's resume attempt briefly sets status='streaming' during GET /stream fetch
  // 3. handleResumedStreamDetection sets isExplicitlyStreaming=true
  // 4. GET /stream may return some buffered chunks then end without finish event
  // 5. But isStreaming=true blocks incomplete round resumption
  //
  // Detection: isStreaming: true AND round is incomplete AND no submission in progress
  // Fix: After 2s of no progress, clear isStreaming to allow resumption
  //
  // ✅ FIX: Don't use "checked once" ref - timeout should reset when deps change
  // If resumed stream sends data then stops, deps change → timeout resets → 2s later clears
  // This handles the case where stream resumes partially then dies without finish event
  // ============================================================================
  useEffect(() => {
    // Skip if not streaming (nothing to clear)
    if (!isStreaming) {
      return;
    }

    // Skip if resumption already in progress (streaming will be handled)
    if (waitingToStartStreaming) {
      return;
    }

    // Skip if submission in progress
    if (pendingMessage !== null || hasEarlyOptimisticMessage) {
      return;
    }

    // ✅ FIX: Set timeout that resets each time deps change
    // If streaming continues for 2s without any activity (no dep changes),
    // it's stale and should be cleared to allow incomplete round resumption
    const timeoutId = setTimeout(() => {
      // Clear isStreaming to unblock incomplete round resumption
      // The resumption effect will re-run and trigger remaining participants
      actions.setIsStreaming(false);
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [isStreaming, waitingToStartStreaming, pendingMessage, hasEarlyOptimisticMessage, actions]);

  const currentRoundNumber = messages.length > 0 ? getCurrentRoundNumber(messages) : null;

  // ✅ ORPHANED PRE-SEARCH DETECTION
  // Check if there's a pre-search for a round that has no user message
  // This happens when user refreshes during pre-search/changelog phase
  //
  // ✅ RESUMPTION FIX: Also detect STREAMING pre-searches as orphaned
  // If user refreshes during streaming, the pre-search will be in STREAMING status
  // but the user message hasn't been persisted yet, so we need to recover
  //
  // ✅ DEFENSIVE GUARD: Ensure preSearches is an array before calling .find()
  // During hydration or store initialization, preSearches might momentarily be undefined
  //
  // ✅ FIX: Detect orphaned pre-searches in BOTH STREAMING and COMPLETE status
  // - STREAMING: Add user message for UI display, but don't trigger participants yet
  // - COMPLETE: Add user message AND trigger participants
  // This ensures the UI shows the user message while pre-search is still streaming
  const orphanedPreSearch = Array.isArray(preSearches)
    ? preSearches.find((ps) => {
        // ✅ FIX: Both STREAMING and COMPLETE can be orphaned
        // STREAMING: Need to show user message in UI while search runs
        // COMPLETE: Ready to trigger participants
        // PENDING: Hasn't started execution yet
        // FAILED: Recovery isn't possible
        if (ps.status !== MessageStatuses.COMPLETE && ps.status !== MessageStatuses.STREAMING) {
          return false;
        }

        // Check if there's a user message for this round
        // ✅ FIX: Ignore optimistic messages - they haven't been persisted to backend
        // When user refreshes during pre-search, the optimistic message exists in store
        // but wasn't persisted. We need to treat this as "no user message" so recovery triggers.
        const hasUserMessageForRound = messages.some((msg) => {
          if (msg.role !== MessageRoles.USER) {
            return false;
          }
          // Ignore optimistic messages - they haven't been persisted
          const metadata = msg.metadata;
          if (metadata && typeof metadata === 'object' && 'isOptimistic' in metadata && metadata.isOptimistic === true) {
            return false;
          }
          const msgRound = getRoundNumber(msg.metadata);
          return msgRound === ps.roundNumber;
        });

        // If no user message exists for this pre-search's round, it's orphaned
        return !hasUserMessageForRound;
      })
    : undefined;

  // Find which participants have responded in the current round
  // Also track their model IDs to detect participant config changes
  const respondedParticipantIndices = new Set<number>();
  const respondedModelIds = new Set<string>();
  // ✅ AI SDK RESUME FIX: Track participants with streaming parts separately
  // These are "in progress" from AI SDK resume - we should NOT try to trigger them
  // because `continueFromParticipant` will skip them (they have content) anyway
  const inProgressParticipantIndices = new Set<number>();

  if (currentRoundNumber !== null) {
    messages.forEach((msg) => {
      if (msg.role === MessageRoles.ASSISTANT) {
        const msgRound = getRoundNumber(msg.metadata);
        const participantIndex = getParticipantIndex(msg.metadata);
        // ✅ TYPE-SAFE: Use extraction utility for model ID
        const assistantMetadata = getAssistantMetadata(msg.metadata);
        const modelId = assistantMetadata?.model;

        if (msgRound === currentRoundNumber && participantIndex !== null) {
          // ✅ STRICT COMPLETION GATE: Use isMessageComplete() as the single source of truth
          // This function checks:
          // 1. No parts with `state: 'streaming'`
          // 2. Has text content OR has finishReason
          //
          // A message is ONLY counted as "responded" if it passes this strict check.
          // Messages with streaming parts are NEVER counted as "responded" regardless
          // of isStreaming flag - they are either "in progress" or not counted.
          const messageComplete = isMessageComplete(msg);

          // Check for streaming parts (for in-progress detection)
          const hasStreamingParts = msg.parts?.some(
            p => 'state' in p && p.state === 'streaming',
          ) || false;

          // ✅ FIX: Check for truly empty interrupted responses
          // When a stream is interrupted (e.g., page refresh), the backend sends a synthetic
          // finish event with finishReason: 'unknown' and 0 tokens.
          const hasTextContent = msg.parts?.some(
            p => (p.type === 'text' || p.type === 'reasoning')
              && 'text' in p
              && typeof p.text === 'string'
              && p.text.trim().length > 0,
          ) || false;

          const isEmptyResponse = !hasTextContent && (!msg.parts || msg.parts.length === 0);
          const isEmptyInterruptedResponse = isEmptyResponse
            || (assistantMetadata?.finishReason === FinishReasons.UNKNOWN
              && assistantMetadata?.usage?.totalTokens === 0
              && !hasTextContent);

          if (messageComplete && !isEmptyInterruptedResponse) {
            // ✅ Message is COMPLETE: All parts are done, has content or finishReason
            // Count as "responded" - this participant has finished
            respondedParticipantIndices.add(participantIndex);
            if (modelId) {
              respondedModelIds.add(modelId);
            }
          } else if (hasStreamingParts && hasTextContent) {
            // ✅ Message has STREAMING parts with content
            // This participant is "in progress" - the message exists with partial content
            //
            // ALWAYS count as "in progress" regardless of isStreaming flag because:
            // - We don't want to re-trigger this participant (content already exists)
            // - But we also don't count as "responded" (message isn't complete)
            //
            // The SUMMARY CREATION code has its own strict completion gate that checks
            // for streaming parts via isMessageComplete(), so the summary won't be
            // created prematurely even if all participants are "accounted for".
            inProgressParticipantIndices.add(participantIndex);
            if (modelId) {
              respondedModelIds.add(modelId);
            }
          }
          // If message is incomplete without streaming parts (empty or interrupted),
          // don't count it - participant needs to be re-triggered
        }
      }
    });
  }

  // ✅ CRITICAL FIX: Detect participant configuration changes
  // If user changed participants since the round started, the round should be
  // considered "complete" (not resumable) because:
  // 1. The current enabled participants don't match who responded in the round
  // 2. Trying to resume would trigger wrong participant indices
  // 3. Backend would fail with "Participant at index X not found"
  //
  // Detection: Check if ANY responded model is NOT in current enabled participants
  // If there's a mismatch, participants have changed and round is not resumable
  const currentModelIds = getEnabledParticipantModelIdSet(participants);
  const participantsChangedSinceRound = respondedModelIds.size > 0
    && [...respondedModelIds].some(modelId => !currentModelIds.has(modelId));

  // ✅ INFINITE LOOP FIX: Detect when a submission is in progress
  // When user submits, these flags indicate the submission flow is active:
  // 1. hasEarlyOptimisticMessage: Set before PATCH, cleared by prepareForNewMessage
  // 2. pendingMessage: Set by prepareForNewMessage, used by pending message effect
  // 3. hasSentPendingMessage: Set to true after message is sent
  // If any of these indicate a submission is active, we should NOT try to resume
  const isSubmissionInProgress = hasEarlyOptimisticMessage || (pendingMessage !== null && !hasSentPendingMessage);

  // ✅ OPTIMISTIC MESSAGE FIX: Detect if last user message is optimistic
  // When user submits a new message, an optimistic message is added to the store.
  // If page refreshes before the submission flags are persisted, the optimistic
  // message might exist without hasEarlyOptimisticMessage being set.
  // In this case, we should NOT try to resume - it's a new submission in progress.
  const lastUserMessage = messages.findLast(m => m.role === MessageRoles.USER);
  const lastUserMessageIsOptimistic = lastUserMessage?.metadata
    && typeof lastUserMessage.metadata === 'object'
    && 'isOptimistic' in lastUserMessage.metadata
    && lastUserMessage.metadata.isOptimistic === true;

  // Check if round is incomplete
  // ✅ FIX: Also check that participants haven't changed since round started
  // ✅ INFINITE LOOP FIX: Don't treat round as incomplete during active submission
  // ✅ AI SDK RESUME FIX: Account for in-progress participants (from AI SDK resume)
  // ✅ OPTIMISTIC MESSAGE FIX: Don't resume if last user message is optimistic
  // ✅ NON-INITIAL ROUND FIX: Allow resumption with stale optimistic if prefilled
  // A round is incomplete only if there are participants that need triggering:
  // Total - Responded - InProgress > 0
  const accountedParticipants = respondedParticipantIndices.size + inProgressParticipantIndices.size;

  // ✅ NON-INITIAL ROUND FIX: When streamResumptionPrefilled is true, the optimistic
  // message is stale from Zustand persist, not from an active submission. The pre-search
  // might have completed (proving the submission was received), but the optimistic message
  // wasn't replaced because messages weren't re-initialized from SSR.
  // In this case, allow resumption to proceed.
  //
  // ✅ PRE-SEARCH EVIDENCE FIX: Even if prefill didn't happen (server didn't detect
  // incomplete round because user message wasn't saved), if there's a COMPLETE pre-search
  // for the current round, that proves the submission was received. The user message race
  // condition (not saved to DB) shouldn't block resumption.
  const preSearchIndicatesSubmissionReceived = Array.isArray(preSearches)
    && currentRoundNumber !== null
    && preSearches.some(ps =>
      ps.roundNumber === currentRoundNumber && ps.status === MessageStatuses.COMPLETE,
    );

  const blockOnOptimistic = lastUserMessageIsOptimistic
    && !streamResumptionPrefilled
    && !preSearchIndicatesSubmissionReceived;

  const isIncomplete
    = enabled
      && !isStreaming
      && !waitingToStartStreaming
      && !isSubmissionInProgress // Don't interfere with normal submissions
      && !blockOnOptimistic // Don't resume active optimistic, but allow stale during resumption
      && currentRoundNumber !== null
      && enabledParticipants.length > 0
      && accountedParticipants < enabledParticipants.length
      && !participantsChangedSinceRound;

  // DEBUG: Log isIncomplete calculation
  debugLog('INCOMPLETE', {
    isIncomplete,
    responded: respondedParticipantIndices.size,
    inProgress: inProgressParticipantIndices.size,
    total: enabledParticipants.length,
    round: currentRoundNumber,
    streaming: isStreaming,
    waiting: waitingToStartStreaming,
  });

  // Find the first missing participant index
  // ✅ AI SDK RESUME FIX: Skip BOTH responded AND in-progress participants
  // In-progress participants have partial content from AI SDK resume - accept as-is
  let nextParticipantIndex: number | null = null;

  if (isIncomplete) {
    for (let i = 0; i < enabledParticipants.length; i++) {
      // Skip responded (complete) participants
      if (respondedParticipantIndices.has(i)) {
        continue;
      }
      // Skip in-progress participants (AI SDK resume with partial content)
      if (inProgressParticipantIndices.has(i)) {
        continue;
      }
      // Found a participant that needs triggering
      nextParticipantIndex = i;
      break;
    }
  }

  // ============================================================================
  // ✅ REACT 19 PATTERN: Consolidated ref reset effect
  // All refs that need to reset when threadId changes are handled in one effect
  // This follows React best practice of consolidating related side effects
  // ============================================================================
  // ✅ RACE CONDITION FIX: Track round state signature for re-check detection
  const lastCheckedSignatureRef = useRef<string | null>(null);

  // Reset refs on navigation (threadId change)
  useEffect(() => {
    activeStreamCheckRef.current = null;
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Intentional state reset on navigation
    setActiveStreamCheckComplete(false);
    orphanedPreSearchUIRecoveryRef.current = null;
    orphanedPreSearchRecoveryAttemptedRef.current = null;
    resumptionAttemptedRef.current = null;
    staleWaitingStateRef.current = false; // Reset so stale state detection works on navigation
    lastCheckedSignatureRef.current = null; // Reset signature to allow fresh check
    // ✅ UNIFIED PHASES: Reset phase-based resumption refs
    preSearchPhaseResumptionAttemptedRef.current = null;
    summarizerPhaseResumptionAttemptedRef.current = null;
    // ✅ FAILED TRIGGER RECOVERY: Reset trigger tracking refs
    wasWaitingRef.current = false;
    sawStreamingRef.current = false;
  }, [threadId]);

  // ============================================================================
  // ✅ EFFECT ORDERING FIX: Signature reset MUST run BEFORE immediate placeholder
  // When isStreaming changes from true to false (e.g., stale streaming cleared):
  // 1. isIncomplete changes from false to true
  // 2. Effects run in declaration order
  // 3. Signature reset runs FIRST, clears refs if signature changed
  // 4. Immediate placeholder runs SECOND, sees cleared refs, proceeds to set state
  // 5. Main resumption effect runs THIRD, sees activeStreamCheckComplete=true, proceeds
  //
  // Previously: immediate placeholder ran first, returned early, signature reset ran second
  // and cleared refs, but by then immediate placeholder already returned early!
  // ============================================================================
  // Signature reset for re-check detection when round state changes
  useEffect(() => {
    const currentSignature = `${threadId}_${isIncomplete}_${currentRoundNumber}`;

    // If signature changed and we previously checked as "complete", reset refs
    // This allows re-checking when round becomes incomplete
    if (lastCheckedSignatureRef.current !== null
      && lastCheckedSignatureRef.current !== currentSignature
      && activeStreamCheckRef.current === threadId
    ) {
      // Round state changed - need to re-check
      // But only reset if we're not currently in the middle of resumption
      if (!waitingToStartStreaming && !isStreaming) {
        activeStreamCheckRef.current = null;
        // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- State reset on signature change
        setActiveStreamCheckComplete(false);
        // ✅ BUG FIX: Do NOT reset resumptionAttemptedRef here!
        // This was causing an infinite loop:
        // 1. TRIGGER fires → sets waitingToStartStreaming: true
        // 2. isIncomplete becomes false (due to !waitingToStartStreaming check)
        // 3. Signature changes → this effect resets resumptionAttemptedRef = null
        // 4. waitingToStartStreaming is cleared somewhere → isIncomplete becomes true
        // 5. TRIGGER fires again because ref was reset → infinite loop!
        //
        // resumptionAttemptedRef should ONLY be reset on navigation (threadId change)
        // which is handled by the ref reset effect above.
        // resumptionAttemptedRef.current = null; // REMOVED
      }
    }

    lastCheckedSignatureRef.current = currentSignature;
  }, [threadId, isIncomplete, currentRoundNumber, waitingToStartStreaming, isStreaming]);

  // ✅ OPTIMIZED: Set streamingRoundNumber immediately when incomplete round detected
  // This enables placeholder rendering WITHOUT waiting for backend check
  // Previously we made a duplicate /stream call just to get headers - now we use local calculation
  // AI SDK's resume:true already handles the stream resumption via prepareReconnectToStreamRequest
  useEffect(() => {
    if (!enabled || !threadId) {
      return;
    }

    // Skip if already checked for this thread
    if (activeStreamCheckRef.current === threadId) {
      return;
    }

    // ✅ TIMING FIX: Don't mark as checked until we have enough data to make a decision
    // If currentRoundNumber is null, data hasn't loaded yet - don't mark as checked
    // Otherwise we skip checking when data arrives and miss incomplete rounds
    if (currentRoundNumber === null) {
      return; // Wait for data to load
    }

    // ✅ IMMEDIATE PLACEHOLDER SUPPORT: Set store state from local calculation
    // When round is incomplete, set streamingRoundNumber immediately for placeholder rendering
    // This removes the need for a duplicate backend fetch just to read headers
    if (isIncomplete && nextParticipantIndex !== null) {
      actions.setStreamingRoundNumber(currentRoundNumber);
      actions.setCurrentParticipantIndex(nextParticipantIndex);
    }

    // Mark thread as checked
    activeStreamCheckRef.current = threadId;

    // ✅ RACE CONDITION FIX: Delay marking as complete to allow AI SDK to start resuming
    // AI SDK's resume:true causes a GET call on mount. If there's data to resume,
    // isStreaming will become true. We delay briefly to give that a chance to happen
    // before allowing the main trigger effect to run.
    // ✅ FIX: Use state setter instead of ref to ensure effect re-runs after timeout
    const timeoutId = setTimeout(() => {
      setActiveStreamCheckComplete(true);
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [enabled, threadId, isIncomplete, currentRoundNumber, nextParticipantIndex, actions]);

  // ✅ ORPHANED PRE-SEARCH UI RECOVERY EFFECT
  // When a user refreshes during pre-search/changelog phase, the pre-search may be
  // STREAMING or COMPLETE but the user message is never sent. This effect adds the
  // user message for UI display IMMEDIATELY, even if another round is streaming.
  //
  // This is split from participant triggering because:
  // - User might refresh while round N is completing AND round N+1 pre-search is running
  // - We want to show round N+1 user message immediately (UI feedback)
  // - But we don't trigger participants until round N finishes AND pre-search completes
  useEffect(() => {
    // Skip if not enabled
    if (!enabled) {
      return;
    }

    // Skip if no orphaned pre-search detected
    if (!orphanedPreSearch || !orphanedPreSearch.userQuery) {
      return;
    }

    // Skip if already added UI for this specific pre-search
    const orphanedPreSearchId = orphanedPreSearch.id;
    if (orphanedPreSearchUIRecoveryRef.current === orphanedPreSearchId) {
      return;
    }

    // Check if user message for this round already exists
    const orphanedRoundNumber = orphanedPreSearch.roundNumber;
    const hasUserMessageForRound = messages.some((msg) => {
      if (msg.role !== MessageRoles.USER) {
        return false;
      }
      // Include optimistic messages - they count as having a user message
      const msgRound = getRoundNumber(msg.metadata);
      return msgRound === orphanedRoundNumber;
    });

    // If user message already exists, skip UI recovery
    if (hasUserMessageForRound) {
      orphanedPreSearchUIRecoveryRef.current = orphanedPreSearchId;
      return;
    }

    // Mark as done for this pre-search
    orphanedPreSearchUIRecoveryRef.current = orphanedPreSearchId;

    const recoveredQuery = orphanedPreSearch.userQuery;

    const optimisticUserMessage = createOptimisticUserMessage({
      roundNumber: orphanedRoundNumber,
      text: recoveredQuery,
    });

    // Add the message to display (preserving existing messages)
    actions.setMessages([...messages, optimisticUserMessage]);

    // ✅ FIX: Also set streamingRoundNumber if pre-search is still streaming
    // This enables participant placeholder rendering
    if (orphanedPreSearch.status === MessageStatuses.STREAMING) {
      actions.setStreamingRoundNumber(orphanedRoundNumber);
    }
  }, [enabled, orphanedPreSearch, messages, actions]);

  // ✅ ORPHANED PRE-SEARCH PARTICIPANT TRIGGERING EFFECT
  // This effect triggers participants ONLY when:
  // 1. Not currently streaming (round N must complete first)
  // 2. Pre-search is COMPLETE (search results are ready)
  // 3. User message exists (added by UI recovery above)
  useEffect(() => {
    // Skip if not enabled or currently streaming another round
    if (!enabled || isStreaming || waitingToStartStreaming) {
      return;
    }

    // Skip if a submission is already in progress
    if (hasEarlyOptimisticMessage || (pendingMessage !== null && !hasSentPendingMessage)) {
      return;
    }

    // Skip if no orphaned pre-search detected
    if (!orphanedPreSearch || !orphanedPreSearch.userQuery) {
      return;
    }

    // Skip if pre-search is still streaming - wait for it to complete
    if (orphanedPreSearch.status !== MessageStatuses.COMPLETE) {
      return;
    }

    // Skip if no enabled participants
    if (enabledParticipants.length === 0) {
      return;
    }

    // Skip if already attempted for this specific pre-search
    const orphanedPreSearchId = orphanedPreSearch.id;
    if (orphanedPreSearchRecoveryAttemptedRef.current === orphanedPreSearchId) {
      return;
    }

    const recoveredQuery = orphanedPreSearch.userQuery;
    const orphanedRoundNumber = orphanedPreSearch.roundNumber;

    // ✅ FIX: Remove existing optimistic messages for this round BEFORE prepareForNewMessage
    // On page refresh, the optimistic message might persist in store (via Zustand persist)
    // but wasn't actually sent to backend.
    const messagesWithoutOrphanedOptimistic = messages.filter((msg) => {
      if (msg.role !== MessageRoles.USER) {
        return true;
      }
      const metadata = msg.metadata;
      const isOptimistic = metadata && typeof metadata === 'object' && 'isOptimistic' in metadata && metadata.isOptimistic === true;
      if (!isOptimistic) {
        return true;
      }
      const msgRound = getRoundNumber(metadata);
      return msgRound !== orphanedRoundNumber;
    });
    actions.setMessages(messagesWithoutOrphanedOptimistic);

    // Get enabled participant MODEL IDs for the expected participants
    const expectedModelIds = getParticipantModelIds(enabledParticipants);

    // Set expected participant IDs (required by pendingMessage effect)
    actions.setExpectedParticipantIds(expectedModelIds);

    // Prepare for new message - this sets pendingMessage and adds optimistic user message
    actions.prepareForNewMessage(recoveredQuery, expectedModelIds);

    // ✅ CRITICAL FIX: Clear isWaitingForChangelog immediately after prepareForNewMessage
    // This MUST happen BEFORE marking as attempted, so pendingMessage effect can run
    actions.setIsWaitingForChangelog(false);

    // ✅ ROBUSTNESS FIX: Set streamingRoundNumber and waitingToStartStreaming
    // to trigger the round resumption flow instead of relying solely on pendingMessage effect
    // This ensures participants start even if pendingMessage effect has timing issues
    actions.setStreamingRoundNumber(orphanedRoundNumber);
    actions.setNextParticipantToTrigger(0);
    actions.setWaitingToStartStreaming(true);

    // ✅ FIX: Mark as attempted AFTER setting all state, so if something fails we can retry
    orphanedPreSearchRecoveryAttemptedRef.current = orphanedPreSearchId;
  }, [
    enabled,
    isStreaming,
    waitingToStartStreaming,
    hasEarlyOptimisticMessage,
    pendingMessage,
    hasSentPendingMessage,
    orphanedPreSearch,
    enabledParticipants,
    messages,
    actions,
  ]);

  // Effect to trigger resumption
  useEffect(() => {
    // DEBUG: Log effect state (debounced)
    debugLog('EFFECT', {
      streaming: isStreaming,
      waiting: waitingToStartStreaming,
      incomplete: isIncomplete,
      nextP: nextParticipantIndex,
      round: currentRoundNumber,
      ref: resumptionAttemptedRef.current,
    });

    // Skip if not enabled or already streaming
    if (!enabled || isStreaming || waitingToStartStreaming) {
      return;
    }

    // ✅ UNIFIED PHASES: Skip if server prefilled a different phase
    // When currentResumptionPhase is set, we let phase-specific effects handle resumption
    // This prevents overlapping triggers (e.g., triggering participants while pre-search is streaming)
    if (streamResumptionPrefilled && currentResumptionPhase) {
      // If prefilled phase is pre_search or summarizer, don't run participant resumption here
      // Those phases have their own effects that will transition to participants when ready
      if (currentResumptionPhase === 'pre_search' || currentResumptionPhase === 'summarizer') {
        return;
      }
      // If phase is 'idle' or 'complete', no resumption needed
      if (currentResumptionPhase === 'idle' || currentResumptionPhase === 'complete') {
        return;
      }
      // If phase is 'participants', this effect should handle it (continue below)
    }

    // ✅ OPTIMIZED: Wait for initial check to complete (no longer makes network call)
    // ✅ FIX: Using state instead of ref ensures effect re-runs after 100ms timeout
    if (!activeStreamCheckComplete) {
      return;
    }

    // ✅ INFINITE LOOP FIX: Skip if a submission is in progress
    // This prevents the hook from interfering with normal message submissions.
    // When user submits, these states indicate submission is active:
    // - hasEarlyOptimisticMessage: Set before PATCH, cleared by prepareForNewMessage
    // - pendingMessage with !hasSentPendingMessage: Message ready to send
    if (hasEarlyOptimisticMessage || (pendingMessage !== null && !hasSentPendingMessage)) {
      return;
    }

    // Use local calculation for next participant (no longer depends on backend ref)
    const effectiveNextParticipant = nextParticipantIndex;

    // Skip if already attempted for this specific participant
    // ✅ FIX: Track per-participant, not per-thread, so we can trigger subsequent participants
    // Previously used threadId which blocked ALL subsequent participants after first trigger
    const resumptionKey = `${threadId}_r${currentRoundNumber}_p${effectiveNextParticipant}`;
    if (resumptionAttemptedRef.current === resumptionKey) {
      return;
    }

    // Skip if round is complete
    if (!isIncomplete || effectiveNextParticipant === null || currentRoundNumber === null) {
      return;
    }

    // ✅ FIX: Wait for in-progress participants (AI SDK actively resuming) to finish
    // When page refreshes mid-stream, AI SDK resumes the interrupted stream.
    // We should NOT trigger new participants until that resume completes.
    // Otherwise: TRIGGER fires → AI SDK resume sets isStreaming=true → "clear waiting"
    // effect runs → waitingToStartStreaming=false → new participant never actually starts
    if (inProgressParticipantIndices.size > 0) {
      return;
    }

    // Skip if no messages yet (new thread)
    if (messages.length === 0) {
      return;
    }

    // ✅ INFINITE LOOP FIX: Skip if the user message for this round is optimistic
    // Optimistic messages are added by handleUpdateThreadAndSend before the actual submission.
    // We should NOT try to "resume" a round that was just started - that's handled by pendingMessage effect.
    const userMessageForRound = messages.find((msg) => {
      if (msg.role !== MessageRoles.USER) {
        return false;
      }
      const msgRound = getRoundNumber(msg.metadata);
      return msgRound === currentRoundNumber;
    });

    if (!userMessageForRound) {
      return;
    }

    // ✅ PRE-SEARCH BLOCKING FIX: Don't resume participants if pre-search is still in progress
    // When user refreshes during pre-search streaming, we must wait for pre-search to complete
    // before triggering participants. This reuses the same blocking logic as pendingMessage sender.
    // The effect will re-run when preSearches updates (status changes from STREAMING to COMPLETE).
    //
    // ✅ SINGLE SOURCE OF TRUTH: Thread state is source of truth; form state only for new chats
    const effectiveWebSearchEnabled = getEffectiveWebSearchEnabled(thread, enableWebSearch);
    const preSearchForRound = preSearches.find(ps => ps.roundNumber === currentRoundNumber);
    if (shouldWaitForPreSearch(effectiveWebSearchEnabled, preSearchForRound)) {
      return;
    }

    // ✅ RESUMPTION FIX: Check optimistic message AFTER pre-search check
    // If user message is optimistic AND pre-search is NOT complete, this is a new submission in progress.
    // BUT if pre-search is COMPLETE, the backend processed the request, so the optimistic message
    // is effectively valid - we should proceed with participant resumption.
    //
    // Scenario this fixes:
    // 1. User sends message → optimistic message added → pre-search starts
    // 2. Page refresh during/after pre-search
    // 3. On reload: optimistic message persisted, pre-search complete, no participant responses
    // 4. Previously: blocked on "optimistic = new submission", participants never started
    // 5. Now: pre-search complete means backend processed it, allow resumption
    const metadata = userMessageForRound.metadata;
    const isOptimistic = metadata && typeof metadata === 'object' && 'isOptimistic' in metadata && metadata.isOptimistic === true;
    const preSearchIsComplete = preSearchForRound?.status === MessageStatuses.COMPLETE;
    if (isOptimistic && !preSearchIsComplete) {
      return;
    }

    // =========================================================================
    // ✅ DUPLICATE MESSAGE FIX: Check if participant already has a complete message
    // =========================================================================
    // Before triggering a participant, check if they already have a message in the store.
    // This prevents duplicate messages when:
    // 1. Participant was streaming before refresh
    // 2. Stream completed and message was saved to DB
    // 3. On refresh, this hook detects "incomplete round" and wants to trigger same participant
    // 4. Without this check, a NEW message would be created (duplicate)
    //
    // The deterministic message ID format is: {threadId}_r{roundNumber}_p{participantIndex}
    const expectedMessageId = `${threadId}_r${currentRoundNumber}_p${effectiveNextParticipant}`;
    const existingMessage = messages.find(msg => msg.id === expectedMessageId);

    if (existingMessage) {
      // Check if the existing message is complete (has content and valid finish reason)
      const existingMetadata = getAssistantMetadata(existingMessage.metadata);
      const hasContent = existingMessage.parts?.some(
        p => p.type === 'text' && typeof p.text === 'string' && p.text.trim().length > 0,
      ) || false;
      const isComplete = hasContent && existingMetadata?.finishReason !== FinishReasons.UNKNOWN;

      if (isComplete) {
        // Message already exists and is complete - skip this participant
        // The incomplete round detection will find the NEXT participant that needs to respond
        return;
      }

      // Message exists but is incomplete (empty or interrupted)
      // Allow triggering to resume/retry this participant
    }

    // Mark as attempted to prevent duplicate triggers for this specific participant
    resumptionAttemptedRef.current = resumptionKey;

    // DEBUG: Log when resumption triggers participant
    debugLog('TRIGGER', {
      round: currentRoundNumber,
      nextP: effectiveNextParticipant,
      key: resumptionKey,
    });

    // Set up store state for resumption
    // The provider's effect watching nextParticipantToTrigger will trigger the participant
    actions.setStreamingRoundNumber(currentRoundNumber);
    actions.setNextParticipantToTrigger(effectiveNextParticipant);
    actions.setCurrentParticipantIndex(effectiveNextParticipant);

    // Set waiting flag so provider knows to start streaming
    actions.setWaitingToStartStreaming(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inProgressParticipantIndices is derived from messages (already in deps)
  }, [
    enabled,
    isStreaming,
    waitingToStartStreaming,
    isIncomplete,
    nextParticipantIndex,
    currentRoundNumber,
    threadId,
    messages,
    // ✅ INFINITE LOOP FIX: Include submission state in dependencies
    hasEarlyOptimisticMessage,
    pendingMessage,
    hasSentPendingMessage,
    // ✅ PRE-SEARCH BLOCKING FIX: Include pre-search state in dependencies
    // Effect re-runs when preSearches changes (e.g., STREAMING → COMPLETE)
    preSearches,
    enableWebSearch,
    // ✅ RACE CONDITION FIX: Include thread to detect when thread.enableWebSearch is loaded
    thread,
    // ✅ UNIFIED PHASES: Include phase state for proper phase-based resumption
    currentResumptionPhase,
    streamResumptionPrefilled,
    // ✅ FIX: Now using state instead of ref, so it's in deps and triggers re-runs
    activeStreamCheckComplete,
    actions,
  ]);

  // ============================================================================
  // ✅ FAILED TRIGGER RECOVERY: Clear resumptionAttemptedRef when trigger fails
  // ============================================================================
  // Problem: When continueFromParticipant() is called but returns early (e.g., due
  // to isTriggeringRef being stuck), the resumptionAttemptedRef is already set.
  // Later when STALE TRIGGER RECOVERY clears state, waitingToStartStreaming goes
  // false but resumptionAttemptedRef prevents retry.
  //
  // Detection: waitingToStartStreaming was set (by us) then cleared (by timeout
  // or stale recovery) WITHOUT isStreaming ever becoming true.
  //
  // Fix: Track if we set waitingToStartStreaming. If it transitions to false
  // without streaming starting, clear resumptionAttemptedRef to allow retry.
  // ============================================================================
  useEffect(() => {
    if (waitingToStartStreaming) {
      // We just set waitingToStartStreaming - track it
      wasWaitingRef.current = true;
      sawStreamingRef.current = false;
    } else if (wasWaitingRef.current) {
      // waitingToStartStreaming just went false
      wasWaitingRef.current = false;

      if (!sawStreamingRef.current && !isStreaming) {
        // Trigger failed - waitingToStartStreaming was cleared but streaming never started
        // Clear resumptionAttemptedRef to allow retry
        if (resumptionAttemptedRef.current !== null) {
          debugLog('RETRY_ALLOWED', {
            reason: 'trigger_failed',
            clearedKey: resumptionAttemptedRef.current,
          });
          resumptionAttemptedRef.current = null;
        }
      }
    }

    if (isStreaming) {
      // Streaming started successfully
      sawStreamingRef.current = true;
    }
  }, [waitingToStartStreaming, isStreaming]);

  // ============================================================================
  // ✅ UNIFIED PHASES: PRE-SEARCH PHASE RESUMPTION EFFECT
  // ============================================================================
  // When server prefills state with currentResumptionPhase = 'pre_search':
  // - The pre-search was interrupted mid-stream
  // - PreSearchStream component handles its own resumption (NOT AI SDK)
  // - This effect monitors pre-search completion and transitions to participants phase
  //
  // Flow:
  // 1. Server prefills preSearchResumption with status='streaming'
  // 2. AI SDK resume receives 204 (non-participant phase) - does nothing
  // 3. PreSearchStream component (rendered via timeline) handles its own resumption
  // 4. When pre-search completes, status changes to 'complete' in preSearches array
  // 5. This effect detects completion and triggers participant resumption
  useEffect(() => {
    // Only run if we have a pre-search phase to resume
    if (currentResumptionPhase !== 'pre_search' || !streamResumptionPrefilled) {
      return;
    }

    // Skip if already attempted
    const resumptionKey = `${threadId}_presearch_${resumptionRoundNumber}`;
    if (preSearchPhaseResumptionAttemptedRef.current === resumptionKey) {
      return;
    }

    // Check if pre-search has completed
    // First check the store's preSearches array (populated from server data)
    const preSearchForRound = preSearches.find(ps => ps.roundNumber === resumptionRoundNumber);
    const preSearchComplete = preSearchForRound?.status === MessageStatuses.COMPLETE;
    const preSearchFailed = preSearchForRound?.status === MessageStatuses.FAILED;

    // Also check the prefilled resumption state for initial status
    // This handles the case where preSearches array hasn't been populated yet
    const prefilledComplete = preSearchResumption?.status === MessageStatuses.COMPLETE;
    const prefilledFailed = preSearchResumption?.status === MessageStatuses.FAILED;

    if (preSearchComplete || preSearchFailed || prefilledComplete || prefilledFailed) {
      // Mark as attempted
      preSearchPhaseResumptionAttemptedRef.current = resumptionKey;

      // ✅ PHASE TRANSITION FIX: Clear pre-search state and transition to participants phase
      // This prevents stale preSearchResumption.status: 'streaming' when pre-search is complete
      actions.transitionToParticipantsPhase();

      // Set up for participant triggering
      if ((preSearchComplete || prefilledComplete) && resumptionRoundNumber !== null) {
        actions.setStreamingRoundNumber(resumptionRoundNumber);
        actions.setNextParticipantToTrigger(0);
        actions.setWaitingToStartStreaming(true);
      }
    }
  }, [
    currentResumptionPhase,
    streamResumptionPrefilled,
    threadId,
    resumptionRoundNumber,
    preSearches,
    preSearchResumption, // ✅ Include prefilled state in dependencies
    actions,
  ]);

  // ============================================================================
  // ✅ UNIFIED PHASES: SUMMARIZER PHASE RESUMPTION EFFECT
  // ============================================================================
  // When server prefills state with currentResumptionPhase = 'summarizer':
  // - All participants have finished their responses
  // - The round summary was interrupted mid-stream
  // - RoundSummaryStream component handles its own resumption (NOT AI SDK)
  //
  // Flow:
  // 1. Server prefills summarizerResumption with status='pending' or 'streaming'
  // 2. AI SDK resume receives 204 (non-participant phase) - does nothing
  // 3. RoundSummaryStream component (rendered via timeline) handles resumption via attemptSummaryResume
  // 4. If 'pending': Component triggers summary streaming automatically
  // 5. When summary completes, the round is complete
  useEffect(() => {
    // Only run if we have a summarizer phase to resume
    if (currentResumptionPhase !== 'summarizer' || !streamResumptionPrefilled) {
      return;
    }

    // Skip if already creating summary (prevents double triggers)
    if (isCreatingSummary) {
      return;
    }

    // Skip if already streaming (AI SDK resume is handling it)
    if (isStreaming || waitingToStartStreaming) {
      return;
    }

    // Skip if already attempted
    const resumptionKey = `${threadId}_summarizer_${resumptionRoundNumber}`;
    if (summarizerPhaseResumptionAttemptedRef.current === resumptionKey) {
      return;
    }

    // ✅ STRICT STREAMING CHECK: Block summarizer if AI SDK is still streaming
    // This is the FIRST gate - never trigger summarizer while any streaming is active.
    // This catches cases where:
    // 1. Last participant just started (message created but no streaming parts yet)
    // 2. Message sync race (parts not updated yet)
    if (isStreaming) {
      debugLog('SUMMARIZER_BLOCKED', { reason: 'isStreaming=true' });
      return;
    }

    // ✅ STRICT COMPLETION GATE: Verify all participants have finished BEFORE triggering summarizer
    // This prevents the race condition where summarizer starts while a participant is still streaming
    if (resumptionRoundNumber !== null) {
      const completionStatus = getParticipantCompletionStatus(
        messages,
        participants,
        resumptionRoundNumber,
      );

      if (!completionStatus.allComplete) {
        // Participants still streaming - don't trigger summarizer yet
        // The effect will re-run when messages update with completed participants
        logParticipantCompletionStatus(completionStatus, 'incomplete-round-resumption:summarizer');
        return;
      }
    }

    // Check if summary already exists for this round
    const summaryForRound = summaries.find(s => s.roundNumber === resumptionRoundNumber);

    if (summaryForRound) {
      // Summary exists - check its status
      if (summaryForRound.status === MessageStatuses.COMPLETE) {
        // Round is complete - clear resumption state
        summarizerPhaseResumptionAttemptedRef.current = resumptionKey;
        actions.clearStreamResumption();
        return;
      }

      if (summaryForRound.status === MessageStatuses.STREAMING) {
        // RoundSummaryStream component handles STREAMING status via attemptSummaryResume
        // Just mark as attempted - component will handle resumption when rendered
        summarizerPhaseResumptionAttemptedRef.current = resumptionKey;
        return;
      }

      if (summaryForRound.status === MessageStatuses.PENDING) {
        // Pending summary needs to be triggered
        summarizerPhaseResumptionAttemptedRef.current = resumptionKey;
        // Set streaming flags to trigger summary streaming
        // The summary streaming is handled by the chat-store-provider's summary effect
        actions.setStreamingRoundNumber(resumptionRoundNumber);
        actions.setIsCreatingSummary(true);
        actions.setWaitingToStartStreaming(true);
      }
    } else if (summarizerResumption?.summaryId) {
      // No summary in store but server says we have one
      // The summary exists on the backend but hasn't been loaded to the store yet
      // This typically means the page was refreshed during summary streaming
      // The summary data should be fetched by the thread data loading
      // Just mark as attempted and let normal flow handle it
      summarizerPhaseResumptionAttemptedRef.current = resumptionKey;

      // Set streaming state to indicate summary is in progress
      // The thread data loading will populate the summaries array
      if (resumptionRoundNumber !== null) {
        actions.setStreamingRoundNumber(resumptionRoundNumber);
        actions.setIsCreatingSummary(true);
        // Don't set waitingToStartStreaming here - let the summary
        // be loaded from server first, then the normal summary
        // streaming flow will pick it up
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- messages/participants only used for getParticipantCompletionStatus; effect re-runs on summaries/phase changes
  }, [
    currentResumptionPhase,
    streamResumptionPrefilled,
    threadId,
    resumptionRoundNumber,
    summarizerResumption,
    summaries,
    isCreatingSummary,
    isStreaming,
    waitingToStartStreaming,
    actions,
  ]);

  return {
    isIncomplete,
    nextParticipantIndex,
    resumingRoundNumber: isIncomplete ? currentRoundNumber : null,
    // ✅ UNIFIED PHASES: Expose current resumption phase for debugging/UI
    currentResumptionPhase: streamResumptionPrefilled ? currentResumptionPhase : null,
  };
}
