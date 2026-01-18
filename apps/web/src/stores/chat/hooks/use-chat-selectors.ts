/**
 * Reusable Chat Store Selectors
 *
 * Centralized selector hooks following Zustand v5 best practices.
 * All multi-value selectors use useShallow to prevent unnecessary re-renders.
 *
 * PATTERNS:
 * - Atomic selectors for primitives (no useShallow needed)
 * - useShallow for object/array selections (prevents re-renders)
 * - Named exports for easy tree-shaking
 *
 * Location: /src/stores/chat/hooks/use-chat-selectors.ts
 */

import { useShallow } from 'zustand/react/shallow';

import { useChatStore } from '@/components/providers/chat-store-provider/context';

// ============================================================================
// ATOMIC SELECTORS (Single primitive values - no useShallow needed)
// ============================================================================

/** Get input value */
export const useInputValue = () => useChatStore(s => s.inputValue);

/** Get streaming state */
export const useIsStreaming = () => useChatStore(s => s.isStreaming);

/** Get moderator streaming state */
export const useIsModeratorStreaming = () => useChatStore(s => s.isModeratorStreaming);

/** Get thread creation state */
export const useIsCreatingThread = () => useChatStore(s => s.isCreatingThread);

/** Get waiting to start streaming state */
export const useWaitingToStartStreaming = () => useChatStore(s => s.waitingToStartStreaming);

/** Get show initial UI state */
export const useShowInitialUI = () => useChatStore(s => s.showInitialUI);

/** Get pending message */
export const usePendingMessage = () => useChatStore(s => s.pendingMessage);

/** Get created thread ID */
export const useCreatedThreadId = () => useChatStore(s => s.createdThreadId);

/** Get current participant index */
export const useCurrentParticipantIndex = () => useChatStore(s => s.currentParticipantIndex);

/** Get streaming round number */
export const useStreamingRoundNumber = () => useChatStore(s => s.streamingRoundNumber);

/** Get auto mode state */
export const useAutoMode = () => useChatStore(s => s.autoMode);

/** Get analyzing prompt state */
export const useIsAnalyzingPrompt = () => useChatStore(s => s.isAnalyzingPrompt);

/** Get regenerating state */
export const useIsRegenerating = () => useChatStore(s => s.isRegenerating);

/** Get regenerating round number */
export const useRegeneratingRoundNumber = () => useChatStore(s => s.regeneratingRoundNumber);

/** Get web search enabled state (current form state) */
export const useFormEnableWebSearch = () => useChatStore(s => s.enableWebSearch);

/** Get has pending config changes state */
export const useHasPendingConfigChanges = () => useChatStore(s => s.hasPendingConfigChanges);

// ============================================================================
// BATCH SELECTORS (Multiple values - useShallow for performance)
// ============================================================================

/** Get thread info (id, title, slug) */
export function useThreadInfo() {
  return useChatStore(
    useShallow(s => ({
      thread: s.thread,
      threadId: s.thread?.id ?? null,
      threadTitle: s.thread?.title ?? null,
      threadSlug: s.thread?.slug ?? null,
    })),
  );
}

/** Get streaming state bundle (all streaming-related flags) */
export function useStreamingState() {
  return useChatStore(
    useShallow(s => ({
      isStreaming: s.isStreaming,
      isModeratorStreaming: s.isModeratorStreaming,
      waitingToStartStreaming: s.waitingToStartStreaming,
      streamingRoundNumber: s.streamingRoundNumber,
      currentParticipantIndex: s.currentParticipantIndex,
    })),
  );
}

/** Get busy state (streaming, creating, waiting, etc.) */
export function useIsBusy() {
  return useChatStore(
    useShallow(s => ({
      isBusy:
        s.isStreaming
        || s.waitingToStartStreaming
        || s.isCreatingThread
        || s.streamingRoundNumber !== null
        || s.preSearches.some(ps => ps.status === 'pending' || ps.status === 'streaming'),
    })),
  );
}

/** Get form state (mode, participants, input, web search) */
export function useFormState() {
  return useChatStore(
    useShallow(s => ({
      selectedMode: s.selectedMode,
      selectedParticipants: s.selectedParticipants,
      inputValue: s.inputValue,
      enableWebSearch: s.enableWebSearch,
      modelOrder: s.modelOrder,
      autoMode: s.autoMode,
    })),
  );
}

/** Get form actions (setters for form state) */
export function useFormActions() {
  return useChatStore(
    useShallow(s => ({
      setInputValue: s.setInputValue,
      setSelectedMode: s.setSelectedMode,
      setSelectedParticipants: s.setSelectedParticipants,
      setEnableWebSearch: s.setEnableWebSearch,
      setModelOrder: s.setModelOrder,
      setAutoMode: s.setAutoMode,
    })),
  );
}

/** Get messages and participants */
export function useMessagesAndParticipants() {
  return useChatStore(
    useShallow(s => ({
      messages: s.messages,
      participants: s.participants,
    })),
  );
}

/** Get header state (for navigation headers) */
export function useHeaderState() {
  return useChatStore(
    useShallow(s => ({
      storeThreadTitle: s.thread?.title ?? null,
      storeThreadId: s.thread?.id ?? null,
      showInitialUI: s.showInitialUI,
      createdThreadId: s.createdThreadId,
      thread: s.thread,
    })),
  );
}

/** Get active thread state (for detecting thread activity on overview) */
export function useActiveThreadState() {
  return useChatStore(
    useShallow(s => ({
      showInitialUI: s.showInitialUI,
      createdThreadId: s.createdThreadId,
      thread: s.thread,
    })),
  );
}

/** Get regeneration state */
export function useRegenerationState() {
  return useChatStore(
    useShallow(s => ({
      isRegenerating: s.isRegenerating,
      regeneratingRoundNumber: s.regeneratingRoundNumber,
    })),
  );
}

/** Get resumption state */
export function useResumptionState() {
  return useChatStore(
    useShallow(s => ({
      preSearchResumption: s.preSearchResumption,
      moderatorResumption: s.moderatorResumption,
      currentResumptionPhase: s.currentResumptionPhase,
      resumptionRoundNumber: s.resumptionRoundNumber,
    })),
  );
}

/** Get pre-search state */
export function usePreSearchState() {
  return useChatStore(
    useShallow(s => ({
      preSearches: s.preSearches,
      preSearchResumption: s.preSearchResumption,
    })),
  );
}

/** Get animation state */
export function useAnimationState() {
  return useChatStore(
    useShallow(s => ({
      animationStartIndex: s.animationStartIndex,
      shouldSkipAnimation: s.shouldSkipAnimation,
      animatedMessageIds: s.animatedMessageIds,
    })),
  );
}

/** Get feedback state for a specific round */
export function useFeedbackForRound(roundNumber: number) {
  return useChatStore(s => s.feedbackByRound.get(roundNumber));
}

/** Get all feedback */
export function useAllFeedback() {
  return useChatStore(
    useShallow(s => ({
      feedbackByRound: s.feedbackByRound,
      pendingFeedback: s.pendingFeedback,
      hasLoadedFeedback: s.hasLoadedFeedback,
    })),
  );
}

/** Get screen mode */
export const useScreenMode = () => useChatStore(s => s.screenMode);

// ============================================================================
// COMPUTED SELECTORS (Derived state)
// ============================================================================

/**
 * Check if submit is blocked
 * Combines multiple streaming states into single boolean
 * Returns primitive - no useShallow needed
 */
export function useIsSubmitBlocked() {
  return useChatStore(s =>
    s.isStreaming
    || s.isModeratorStreaming
    || Boolean(s.pendingMessage)
    || s.waitingToStartStreaming,
  );
}

/**
 * Get current streaming participant
 * Returns null if not streaming or index out of bounds
 */
export function useCurrentStreamingParticipant() {
  return useChatStore(
    useShallow(s => ({
      participant: s.participants[s.currentParticipantIndex] || null,
      index: s.currentParticipantIndex,
    })),
  );
}

/**
 * Check if thread has active state
 * Used for detecting thread activity on overview page
 * Returns primitive - no useShallow needed
 */
export function useHasActiveThread() {
  return useChatStore(s => !s.showInitialUI && Boolean(s.createdThreadId || s.thread));
}
