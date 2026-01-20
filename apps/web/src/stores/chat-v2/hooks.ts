/**
 * Chat Store V2 Selector Hooks
 *
 * Pre-built selector hooks with useShallow for common use cases.
 * Prevents selector duplication and re-render issues.
 *
 * USAGE PATTERN:
 * - Import specific hook for your use case
 * - Hooks use useShallow internally for object/array selections
 * - Actions are stable references (no useShallow needed)
 *
 * @example
 * ```typescript
 * // Component
 * import { useThreadState, useFormActions } from '@/stores/chat-v2/hooks';
 *
 * function MyComponent() {
 *   const { thread, messages } = useThreadState();
 *   const { setInputValue } = useFormActions();
 * }
 * ```
 */

import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from '@tanstack/react-router';
import { use, useCallback, useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { ChatStoreContext } from '@/components/providers/chat-store-provider-v2/context';
import { useModelPreferencesStore } from '@/components/providers/preferences-store-provider/context';
import { invalidationPatterns } from '@/lib/data/query-keys';

import { canSubmitMessage as canSubmitCheck, INITIAL_FLOW_STATE, isFlowActive } from './flow-machine';
import type { ChatStore } from './store-schemas';

// ============================================================================
// INTERNAL STORE ACCESS
// ============================================================================

function useStoreApi() {
  const store = use(ChatStoreContext);
  if (!store) {
    throw new Error('useStoreApi must be used within ChatStoreProvider');
  }
  return store;
}

function useStoreSelector<T>(selector: (state: ChatStore) => T): T {
  const store = useStoreApi();
  return useStore(store, selector);
}

function useStoreShallow<T>(selector: (state: ChatStore) => T): T {
  const store = useStoreApi();
  return useStore(store, useShallow(selector));
}

// ============================================================================
// THREAD STATE SELECTORS
// ============================================================================

/**
 * Thread domain state (thread, participants, messages, error)
 */
export function useThreadState() {
  return useStoreShallow(s => ({
    thread: s.thread,
    participants: s.participants,
    messages: s.messages,
    error: s.error,
  }));
}

/**
 * Just the thread entity
 */
export function useThread() {
  return useStoreSelector(s => s.thread);
}

/**
 * Just the messages array
 * Uses useShallow to prevent re-renders on unrelated state changes
 */
export function useMessages() {
  return useStoreShallow(s => s.messages);
}

/**
 * Just the participants array
 * Uses useShallow to prevent re-renders on unrelated state changes
 */
export function useParticipants() {
  return useStoreShallow(s => s.participants);
}

/**
 * Enabled participants only
 */
export function useEnabledParticipants() {
  return useStoreShallow(s =>
    s.participants.filter(p => p.isEnabled),
  );
}

// ============================================================================
// FLOW STATE SELECTORS
// ============================================================================

/**
 * Flow state machine state
 */
export function useFlowState() {
  return useStoreSelector(s => s.flow);
}

/**
 * Derived flow state booleans (for backwards compatibility with components)
 */
export function useFlowDerivedState() {
  return useStoreShallow((s) => {
    const flow = s.flow;
    return {
      isIdle: flow.type === 'idle',
      isCreatingThread: flow.type === 'creating_thread',
      isPreSearch: flow.type === 'pre_search',
      isStreaming: flow.type === 'streaming',
      isAwaitingModerator: flow.type === 'awaiting_moderator',
      isModeratorStreaming: flow.type === 'moderator_streaming',
      isRoundComplete: flow.type === 'round_complete',
      isError: flow.type === 'error',
      isActive: isFlowActive(flow),
      canSubmit: canSubmitCheck(flow),
    };
  });
}

/**
 * Current streaming participant (when in streaming state)
 */
export function useCurrentStreamingParticipant() {
  return useStoreShallow((s) => {
    const flow = s.flow;
    if (flow.type !== 'streaming') {
      return { participantIndex: null, totalParticipants: 0 };
    }
    return {
      participantIndex: flow.participantIndex,
      totalParticipants: flow.totalParticipants,
    };
  });
}

/**
 * Current round number (from flow state)
 */
export function useCurrentRound() {
  return useStoreSelector((s) => {
    const flow = s.flow;
    if ('round' in flow && flow.round !== undefined) {
      return flow.round;
    }
    return null;
  });
}

/**
 * Thread ID from flow state or created thread
 */
export function useEffectiveThreadId() {
  return useStoreSelector((s) => {
    const flow = s.flow;
    if ('threadId' in flow && flow.threadId) {
      return flow.threadId;
    }
    return s.createdThreadId;
  });
}

// ============================================================================
// FORM STATE SELECTORS
// ============================================================================

/**
 * Form input state
 */
export function useFormState() {
  return useStoreShallow(s => ({
    inputValue: s.inputValue,
    selectedMode: s.selectedMode,
    selectedParticipants: s.selectedParticipants,
    enableWebSearch: s.enableWebSearch,
    pendingMessage: s.pendingMessage,
    screenMode: s.screenMode,
  }));
}

/**
 * Just the input value
 */
export function useInputValue() {
  return useStoreSelector(s => s.inputValue);
}

/**
 * Screen mode (overview, thread, public)
 */
export function useScreenMode() {
  return useStoreSelector(s => s.screenMode);
}

/**
 * Selected participants for form
 * Uses useShallow to prevent re-renders on unrelated state changes
 */
export function useSelectedParticipants() {
  return useStoreShallow(s => s.selectedParticipants);
}

// ============================================================================
// PRE-SEARCH SELECTORS
// ============================================================================

/**
 * Pre-search result for a specific round
 */
export function usePreSearchForRound(roundNumber: number) {
  return useStoreSelector(s => s.preSearches.get(roundNumber));
}

/**
 * Check if pre-search is complete for a round
 */
export function useIsPreSearchComplete(roundNumber: number) {
  return useStoreSelector(s => s.isPreSearchComplete(roundNumber));
}

// ============================================================================
// UI STATE SELECTORS
// ============================================================================

/**
 * UI state (loading, title animation)
 */
export function useUIState() {
  return useStoreShallow(s => ({
    hasInitiallyLoaded: s.hasInitiallyLoaded,
    displayedTitle: s.displayedTitle,
    targetTitle: s.targetTitle,
    isTitleAnimating: s.isTitleAnimating,
  }));
}

/**
 * Just the initially loaded flag
 */
export function useHasInitiallyLoaded() {
  return useStoreSelector(s => s.hasInitiallyLoaded);
}

// ============================================================================
// FEEDBACK SELECTORS
// ============================================================================

/**
 * Feedback for a specific round
 */
export function useFeedbackForRound(roundNumber: number) {
  return useStoreSelector(s => s.getFeedback(roundNumber));
}

// ============================================================================
// ACTION SELECTORS (stable references)
// ============================================================================

/**
 * Thread actions
 */
export function useThreadActions() {
  return useStoreShallow(s => ({
    setThread: s.setThread,
    setParticipants: s.setParticipants,
    setMessages: s.setMessages,
    addMessage: s.addMessage,
    updateMessage: s.updateMessage,
    setError: s.setError,
    initializeThread: s.initializeThread,
    resetThread: s.resetThread,
  }));
}

/**
 * Flow/dispatch action
 */
export function useDispatch() {
  return useStoreSelector(s => s.dispatch);
}

/**
 * Form actions
 */
export function useFormActions() {
  return useStoreShallow(s => ({
    setInputValue: s.setInputValue,
    setSelectedMode: s.setSelectedMode,
    setSelectedParticipants: s.setSelectedParticipants,
    addParticipant: s.addParticipant,
    removeParticipant: s.removeParticipant,
    updateParticipant: s.updateParticipant,
    setEnableWebSearch: s.setEnableWebSearch,
    setPendingMessage: s.setPendingMessage,
    setScreenMode: s.setScreenMode,
    resetForm: s.resetForm,
  }));
}

/**
 * Pre-search actions
 */
export function usePreSearchActions() {
  return useStoreShallow(s => ({
    setPreSearch: s.setPreSearch,
    updatePreSearchStatus: s.updatePreSearchStatus,
    clearPreSearches: s.clearPreSearches,
  }));
}

/**
 * UI actions
 */
export function useUIActions() {
  return useStoreShallow(s => ({
    setHasInitiallyLoaded: s.setHasInitiallyLoaded,
    startTitleAnimation: s.startTitleAnimation,
    updateDisplayedTitle: s.updateDisplayedTitle,
    completeTitleAnimation: s.completeTitleAnimation,
  }));
}

/**
 * Feedback actions
 */
export function useFeedbackActions() {
  return useStoreShallow(s => ({
    setFeedback: s.setFeedback,
  }));
}

// ============================================================================
// COMBINED SELECTORS FOR COMMON PATTERNS
// ============================================================================

/**
 * Submit-related state (for chat input component)
 */
export function useSubmitState() {
  return useStoreShallow((s) => {
    const flow = s.flow;
    return {
      inputValue: s.inputValue,
      selectedMode: s.selectedMode,
      selectedParticipants: s.selectedParticipants,
      enableWebSearch: s.enableWebSearch,
      canSubmit: canSubmitCheck(flow),
      isSubmitting: flow.type === 'creating_thread' || isFlowActive(flow),
    };
  });
}

/**
 * Message list state (for message display component)
 */
export function useMessageListState() {
  return useStoreShallow((s) => {
    const flow = s.flow;
    return {
      messages: s.messages,
      participants: s.participants,
      isStreaming: flow.type === 'streaming' || flow.type === 'moderator_streaming',
      currentParticipantIndex: flow.type === 'streaming' ? flow.participantIndex : null,
    };
  });
}

/**
 * Round status (for progress indicators)
 */
export function useRoundStatus() {
  return useStoreShallow((s) => {
    const flow = s.flow;

    // Extract round from flow states that have it (non-optional)
    let round: number | null = null;
    if (
      flow.type === 'pre_search'
      || flow.type === 'streaming'
      || flow.type === 'awaiting_moderator'
      || flow.type === 'moderator_streaming'
      || flow.type === 'round_complete'
    ) {
      round = flow.round;
    } else if (flow.type === 'error' && flow.round !== undefined) {
      round = flow.round;
    }

    const preSearchStatus = round !== null
      ? s.preSearches.get(round)?.status ?? null
      : null;

    return {
      round,
      flowType: flow.type,
      participantIndex: flow.type === 'streaming' ? flow.participantIndex : null,
      totalParticipants: flow.type === 'streaming' ? flow.totalParticipants : s.participants.filter(p => p.isEnabled).length,
      preSearchStatus,
    };
  });
}

// ============================================================================
// NAVIGATION HOOKS
// ============================================================================

/**
 * Hook that provides a callback to reset store when navigating to new chat
 *
 * @returns Callback function to call before navigating to /chat
 *
 * @example
 * ```tsx
 * const handleNewChat = useNavigationReset();
 *
 * <Link href="/chat" onClick={handleNewChat}>
 *   <Plus /> New Chat
 * </Link>
 * ```
 */
export function useNavigationReset() {
  const store = useStoreApi();
  const { thread, createdThreadId } = useStoreShallow(s => ({
    thread: s.thread,
    createdThreadId: s.createdThreadId,
  }));
  const { pathname } = useLocation();
  const previousPathnameRef = useRef(pathname);
  const queryClient = useQueryClient();

  // Read from cookie-persisted model preferences store
  const preferences = useModelPreferencesStore(useShallow(s => ({
    selectedModelIds: s.selectedModelIds,
    modelOrder: s.modelOrder,
    selectedMode: s.selectedMode,
    enableWebSearch: s.enableWebSearch,
  })));

  // Shared reset logic - invalidate queries and reset store
  const doReset = useCallback(() => {
    const effectiveThreadId = thread?.id || createdThreadId;
    if (effectiveThreadId) {
      invalidationPatterns.leaveThread(effectiveThreadId).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    }

    // Reset store to new chat state with preserved preferences
    store.setState({
      // Thread domain
      thread: null,
      participants: [],
      messages: [],
      changelog: [],
      threadUser: null,
      error: null,

      // Round domain
      flow: INITIAL_FLOW_STATE,
      createdThreadId: null,
      createdSlug: null,

      // Form domain - restore from preferences
      inputValue: '',
      selectedMode: preferences.selectedMode as 'analyzing' | 'brainstorming' | 'debating' | 'solving' | null,
      selectedParticipants: preferences.selectedModelIds.map((modelId, index) => ({
        id: `temp-${modelId}`,
        modelId,
        role: null,
        priority: preferences.modelOrder.includes(modelId)
          ? preferences.modelOrder.indexOf(modelId)
          : index,
        customRoleId: null,
      })),
      enableWebSearch: preferences.enableWebSearch,
      pendingMessage: null,
      screenMode: 'overview',

      // PreSearch domain
      preSearches: new Map(),

      // UI domain
      hasInitiallyLoaded: false,
      displayedTitle: null,
      targetTitle: null,
      isTitleAnimating: false,

      // Feedback
      feedbackByRound: new Map(),
    }, false, 'navigation/resetToNewChat');
  }, [thread, createdThreadId, queryClient, store, preferences]);

  // Reset store when navigating FROM thread screen TO /chat
  useEffect(() => {
    const isNavigatingToChat = pathname === '/chat' && previousPathnameRef.current !== '/chat';
    if (isNavigatingToChat) {
      doReset();
    }
    previousPathnameRef.current = pathname;
  }, [pathname, doReset]);

  return doReset;
}

// ============================================================================
// BACKWARD COMPAT SELECTORS
// ============================================================================

/**
 * V1-compatible showInitialUI selector
 * Returns true when on overview with no active thread
 */
export function useShowInitialUI() {
  return useStoreSelector((s) => {
    return s.screenMode === 'overview' && s.flow.type === 'idle' && !s.thread && !s.createdThreadId;
  });
}
