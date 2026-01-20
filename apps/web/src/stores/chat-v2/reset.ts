/**
 * Single Reset Function
 *
 * Replaces 8+ reset functions with a single scoped reset.
 * Uses scope parameter to control what gets reset.
 */

import { INITIAL_FLOW_STATE } from './flow-machine';
import type { ChatStoreApi } from './store';

/**
 * Reset scope - controls what state gets cleared
 */
export type ResetScope
  = | 'all' // Full reset to initial state
    | 'thread' // Clear thread data, keep form config
    | 'form' // Clear form input, keep thread
    | 'round' // Clear round/flow state only
    | 'navigation'; // Reset for navigation (thread + round)

/**
 * Reset store state based on scope
 *
 * @param store - The chat store API
 * @param scope - What to reset
 */
export function reset(store: ChatStoreApi, scope: ResetScope): void {
  switch (scope) {
    case 'all':
      // Full reset - return to initial state
      store.setState({
        // Thread
        thread: null,
        participants: [],
        messages: [],
        error: null,
        // Round
        flow: INITIAL_FLOW_STATE,
        createdThreadId: null,
        createdSlug: null,
        // Form
        inputValue: '',
        selectedMode: null,
        selectedParticipants: [],
        enableWebSearch: false,
        pendingMessage: null,
        screenMode: 'overview',
        // PreSearch
        preSearches: new Map(),
        // UI
        hasInitiallyLoaded: false,
        displayedTitle: null,
        targetTitle: null,
        isTitleAnimating: false,
        // Feedback
        feedbackByRound: new Map(),
      }, false, 'reset/all');
      break;

    case 'thread':
      // Clear thread data, preserve form configuration
      store.setState({
        thread: null,
        participants: [],
        messages: [],
        error: null,
        flow: INITIAL_FLOW_STATE,
        createdThreadId: null,
        createdSlug: null,
        preSearches: new Map(),
        hasInitiallyLoaded: false,
        displayedTitle: null,
        targetTitle: null,
        isTitleAnimating: false,
        feedbackByRound: new Map(),
      }, false, 'reset/thread');
      break;

    case 'form':
      // Clear form input only, keep everything else
      store.setState({
        inputValue: '',
        pendingMessage: null,
      }, false, 'reset/form');
      break;

    case 'round':
      // Reset flow state only, keep thread and messages
      store.setState({
        flow: INITIAL_FLOW_STATE,
        createdThreadId: null,
        createdSlug: null,
        error: null,
      }, false, 'reset/round');
      break;

    case 'navigation':
      // Reset for navigation - clear thread/round but keep form config
      store.setState({
        // Thread
        thread: null,
        participants: [],
        messages: [],
        error: null,
        // Round
        flow: INITIAL_FLOW_STATE,
        createdThreadId: null,
        createdSlug: null,
        // PreSearch
        preSearches: new Map(),
        // UI
        hasInitiallyLoaded: false,
        displayedTitle: null,
        targetTitle: null,
        isTitleAnimating: false,
        // Feedback
        feedbackByRound: new Map(),
        // Keep: selectedMode, selectedParticipants, enableWebSearch, inputValue
        // These are user preferences that should persist during navigation
      }, false, 'reset/navigation');
      break;
  }
}

/**
 * Check if store needs reset for different thread
 */
export function needsReset(store: ChatStoreApi, threadId: string): boolean {
  const { thread } = store.getState();
  return thread !== null && thread.id !== threadId;
}
