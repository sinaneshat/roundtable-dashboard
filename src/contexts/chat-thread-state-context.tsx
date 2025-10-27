'use client';

/**
 * Chat Thread State Context - Advanced State Management with useReducer
 *
 * REACT 19 PATTERN: useReducer + Context for Complex State Management
 * Reference: https://react.dev/learn/scaling-up-with-reducer-and-context
 *
 * This context implements Redux-style immutable state management following:
 * - React 19 useReducer patterns (separate state/dispatch contexts)
 * - Immutable state updates (Redux patterns)
 * - Single source of truth for all chat thread state
 * - Type-safe actions with discriminated unions
 * - AI SDK v5 patterns (refs for non-reactive state)
 *
 * ARCHITECTURE:
 * 1. State stored in useReducer for predictable updates
 * 2. Separate contexts: ChatThreadState (data) + ChatThreadDispatch (actions)
 * 3. Custom hooks: useChatThreadState() + useChatThreadDispatch()
 * 4. Refs for synchronous, non-reactive state (AI SDK v5 pattern)
 * 5. Immutable reducer functions (Redux pattern)
 *
 * USAGE:
 * ```tsx
 * // Wrap your component tree
 * <ChatThreadStateProvider>
 *   <YourComponent />
 * </ChatThreadStateProvider>
 *
 * // Access state (read-only)
 * const state = useChatThreadState();
 * if (state.flags.isWaitingForChangelog) { ... }
 *
 * // Dispatch actions (updates)
 * const dispatch = useChatThreadDispatch();
 * dispatch({ type: 'SET_IS_WAITING_FOR_CHANGELOG', payload: true });
 * dispatch({ type: 'PREPARE_FOR_NEW_MESSAGE', payload: { message: '...', participantIds: [...] } });
 * ```
 */

import { createContext, use, useCallback, useMemo, useReducer, useRef } from 'react';

// ============================================================================
// STATE TYPES
// ============================================================================

/**
 * Thread State Flags
 * Boolean flags for thread lifecycle management
 */
export type ThreadStateFlags = {
  hasInitiallyLoaded: boolean;
  isRegenerating: boolean;
  isCreatingAnalysis: boolean;
  isWaitingForChangelog: boolean;
  hasPendingConfigChanges: boolean;
  hasRefetchedMessages: boolean;
};

/**
 * Thread State Data
 * Data values for pending operations and tracking
 */
export type ThreadStateData = {
  regeneratingRoundNumber: number | null;
  pendingMessage: string | null;
  expectedParticipantIds: string[] | null;
  streamingRoundNumber: number | null;
};

/**
 * Thread State with Refs
 * Complete state including reactive state and non-reactive refs
 */
export type ChatThreadState = {
  flags: ThreadStateFlags;
  data: ThreadStateData;
  // Non-reactive refs (AI SDK v5 pattern)
  currentRoundNumberRef: React.MutableRefObject<number | null>;
  hasSentPendingMessageRef: React.MutableRefObject<boolean>;
  createdAnalysisRoundsRef: React.MutableRefObject<Set<number>>;
};

// ============================================================================
// ACTION TYPES (Redux Pattern: Discriminated Union)
// ============================================================================

export type ChatThreadAction
  // Flag actions
  = | { type: 'SET_HAS_INITIALLY_LOADED'; payload: boolean }
    | { type: 'SET_IS_REGENERATING'; payload: boolean }
    | { type: 'SET_IS_CREATING_ANALYSIS'; payload: boolean }
    | { type: 'SET_IS_WAITING_FOR_CHANGELOG'; payload: boolean }
    | { type: 'SET_HAS_PENDING_CONFIG_CHANGES'; payload: boolean }
    | { type: 'SET_HAS_REFETCHED_MESSAGES'; payload: boolean }

  // Data actions
    | { type: 'SET_REGENERATING_ROUND_NUMBER'; payload: number | null }
    | { type: 'SET_PENDING_MESSAGE'; payload: string | null }
    | { type: 'SET_EXPECTED_PARTICIPANT_IDS'; payload: string[] | null }
    | { type: 'SET_STREAMING_ROUND_NUMBER'; payload: number | null }

  // Batch actions (multiple state updates)
    | { type: 'RESET_THREAD_STATE' }
    | { type: 'PREPARE_FOR_NEW_MESSAGE'; payload: { message: string; participantIds: string[] } }
    | { type: 'COMPLETE_STREAMING' }
    | { type: 'START_REGENERATION'; payload: number }
    | { type: 'COMPLETE_REGENERATION'; payload: number };

// ============================================================================
// REDUCER (Redux Pattern: Pure Function with Immutable Updates)
// ============================================================================

/**
 * Initial state following React best practices
 * Refs are initialized in the provider, not here
 */
const initialFlags: ThreadStateFlags = {
  hasInitiallyLoaded: false,
  isRegenerating: false,
  isCreatingAnalysis: false,
  isWaitingForChangelog: false,
  hasPendingConfigChanges: false,
  hasRefetchedMessages: false,
};

const initialData: ThreadStateData = {
  regeneratingRoundNumber: null,
  pendingMessage: null,
  expectedParticipantIds: null,
  streamingRoundNumber: null,
};

type ReducerState = {
  flags: ThreadStateFlags;
  data: ThreadStateData;
};

const initialReducerState: ReducerState = {
  flags: initialFlags,
  data: initialData,
};

/**
 * Thread State Reducer
 * Pure function that returns new state based on action
 * Follows Redux immutability patterns (spread operators, no mutations)
 */
function chatThreadReducer(state: ReducerState, action: ChatThreadAction): ReducerState {
  switch (action.type) {
    // ========================================================================
    // FLAG ACTIONS - Immutable flag updates
    // ========================================================================
    case 'SET_HAS_INITIALLY_LOADED':
      return {
        ...state,
        flags: { ...state.flags, hasInitiallyLoaded: action.payload },
      };

    case 'SET_IS_REGENERATING':
      return {
        ...state,
        flags: { ...state.flags, isRegenerating: action.payload },
      };

    case 'SET_IS_CREATING_ANALYSIS':
      return {
        ...state,
        flags: { ...state.flags, isCreatingAnalysis: action.payload },
      };

    case 'SET_IS_WAITING_FOR_CHANGELOG':
      return {
        ...state,
        flags: { ...state.flags, isWaitingForChangelog: action.payload },
      };

    case 'SET_HAS_PENDING_CONFIG_CHANGES':
      return {
        ...state,
        flags: { ...state.flags, hasPendingConfigChanges: action.payload },
      };

    case 'SET_HAS_REFETCHED_MESSAGES':
      return {
        ...state,
        flags: { ...state.flags, hasRefetchedMessages: action.payload },
      };

    // ========================================================================
    // DATA ACTIONS - Immutable data updates
    // ========================================================================
    case 'SET_REGENERATING_ROUND_NUMBER':
      return {
        ...state,
        data: { ...state.data, regeneratingRoundNumber: action.payload },
      };

    case 'SET_PENDING_MESSAGE':
      return {
        ...state,
        data: { ...state.data, pendingMessage: action.payload },
      };

    case 'SET_EXPECTED_PARTICIPANT_IDS':
      return {
        ...state,
        data: { ...state.data, expectedParticipantIds: action.payload },
      };

    case 'SET_STREAMING_ROUND_NUMBER':
      return {
        ...state,
        data: { ...state.data, streamingRoundNumber: action.payload },
      };

    // ========================================================================
    // BATCH ACTIONS - Multiple state updates in single action
    // ========================================================================
    case 'RESET_THREAD_STATE':
      // Reset all state to initial values
      return {
        flags: { ...initialFlags },
        data: { ...initialData },
      };

    case 'PREPARE_FOR_NEW_MESSAGE':
      // Prepare state for sending a new message
      return {
        ...state,
        flags: {
          ...state.flags,
          isWaitingForChangelog: true,
        },
        data: {
          ...state.data,
          pendingMessage: action.payload.message,
          // Only update expectedParticipantIds if a non-empty array is provided
          // This allows SET_EXPECTED_PARTICIPANT_IDS to be called before this action
          expectedParticipantIds: action.payload.participantIds.length > 0
            ? action.payload.participantIds
            : state.data.expectedParticipantIds,
        },
      };

    case 'COMPLETE_STREAMING':
      // Complete streaming and reset streaming-related state
      return {
        ...state,
        flags: {
          ...state.flags,
          isCreatingAnalysis: false,
          isRegenerating: false,
        },
        data: {
          ...state.data,
          streamingRoundNumber: null,
          regeneratingRoundNumber: null,
        },
      };

    case 'START_REGENERATION':
      // Start regeneration for a specific round
      return {
        ...state,
        flags: {
          ...state.flags,
          isRegenerating: true,
          isCreatingAnalysis: false,
        },
        data: {
          ...state.data,
          regeneratingRoundNumber: action.payload,
          streamingRoundNumber: null,
        },
      };

    case 'COMPLETE_REGENERATION':
      // Complete regeneration and reset related state
      return {
        ...state,
        flags: {
          ...state.flags,
          isRegenerating: false,
        },
        data: {
          ...state.data,
          regeneratingRoundNumber: null,
          streamingRoundNumber: null,
        },
      };

    default:
      // Type-safe exhaustive check
      throw new Error(`Unknown action type: ${JSON.stringify(action)}`);
  }
}

// ============================================================================
// CONTEXT DEFINITIONS (React 19 Pattern: Separate State and Dispatch)
// ============================================================================

/**
 * Chat Thread State Context
 * Provides read-only access to state
 * Separate from dispatch for performance (state consumers don't re-render on dispatch changes)
 */
const ChatThreadStateContext = createContext<ChatThreadState | undefined>(undefined);

/**
 * Chat Thread Dispatch Context
 * Provides write access via dispatch function
 * Separate from state for performance (dispatch consumers don't re-render on state changes)
 */
const ChatThreadDispatchContext = createContext<React.Dispatch<ChatThreadAction> | undefined>(undefined);

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

export function ChatThreadStateProvider({ children }: { children: React.ReactNode }) {
  // Initialize reducer with initial state
  const [reducerState, dispatch] = useReducer(chatThreadReducer, initialReducerState);

  // Initialize refs (AI SDK v5 pattern for non-reactive state)
  const currentRoundNumberRef = useRef<number | null>(null);
  const hasSentPendingMessageRef = useRef<boolean>(false);
  const createdAnalysisRoundsRef = useRef<Set<number>>(new Set());

  // Memoize state object to prevent unnecessary re-renders
  // Only re-compute when reducer state changes
  const state = useMemo<ChatThreadState>(
    () => ({
      flags: reducerState.flags,
      data: reducerState.data,
      currentRoundNumberRef,
      hasSentPendingMessageRef,
      createdAnalysisRoundsRef,
    }),
    [reducerState],
  );

  // Wrap dispatch in useCallback to prevent unnecessary re-renders
  // Dispatch is stable by default, but we wrap it for explicit memoization
  const stableDispatch = useCallback((action: ChatThreadAction) => {
    dispatch(action);
  }, []);

  return (
    <ChatThreadStateContext value={state}>
      <ChatThreadDispatchContext value={stableDispatch}>
        {children}
      </ChatThreadDispatchContext>
    </ChatThreadStateContext>
  );
}

// ============================================================================
// CUSTOM HOOKS (React 19 Pattern: Convenience Hooks)
// ============================================================================

/**
 * Hook to access chat thread state (read-only)
 * Must be used within ChatThreadStateProvider
 *
 * @example
 * ```tsx
 * const state = useChatThreadState();
 * if (state.flags.isWaitingForChangelog) {
 *   // Handle waiting state
 * }
 * ```
 */
export function useChatThreadState(): ChatThreadState {
  const context = use(ChatThreadStateContext);
  if (!context) {
    throw new Error('useChatThreadState must be used within a ChatThreadStateProvider');
  }
  return context;
}

/**
 * Hook to access dispatch function for state updates
 * Must be used within ChatThreadStateProvider
 *
 * @example
 * ```tsx
 * const dispatch = useChatThreadDispatch();
 *
 * // Single state update
 * dispatch({ type: 'SET_IS_WAITING_FOR_CHANGELOG', payload: true });
 *
 * // Batch update
 * dispatch({
 *   type: 'PREPARE_FOR_NEW_MESSAGE',
 *   payload: { message: 'Hello', participantIds: ['id1', 'id2'] }
 * });
 * ```
 */
export function useChatThreadDispatch(): React.Dispatch<ChatThreadAction> {
  const context = use(ChatThreadDispatchContext);
  if (!context) {
    throw new Error('useChatThreadDispatch must be used within a ChatThreadStateProvider');
  }
  return context;
}

// ============================================================================
// HELPER HOOKS (Optional: High-level Actions)
// ============================================================================

/**
 * Hook providing high-level actions for common operations
 * Wraps dispatch calls in semantic functions
 *
 * @example
 * ```tsx
 * const actions = useChatThreadActions();
 * actions.prepareForNewMessage('Hello', ['id1', 'id2']);
 * actions.completeStreaming();
 * ```
 */
export function useChatThreadActions() {
  const dispatch = useChatThreadDispatch();
  const state = useChatThreadState();

  // Destructure refs outside useMemo to avoid ESLint immutability errors
  const { currentRoundNumberRef, hasSentPendingMessageRef, createdAnalysisRoundsRef } = state;

  return useMemo(
    () => ({
      // Reset operations
      resetThreadState: () => {
        dispatch({ type: 'RESET_THREAD_STATE' });
        // Clear refs manually (refs are not in reducer state)
        currentRoundNumberRef.current = null;
        hasSentPendingMessageRef.current = false;
        createdAnalysisRoundsRef.current.clear();
      },

      // Message operations
      prepareForNewMessage: (message: string, participantIds: string[]) => {
        hasSentPendingMessageRef.current = false;
        dispatch({
          type: 'PREPARE_FOR_NEW_MESSAGE',
          payload: { message, participantIds },
        });
      },

      // Streaming operations
      completeStreaming: () => {
        dispatch({ type: 'COMPLETE_STREAMING' });
        currentRoundNumberRef.current = null;
      },

      // Regeneration operations
      startRegeneration: (roundNumber: number) => {
        dispatch({ type: 'START_REGENERATION', payload: roundNumber });
        createdAnalysisRoundsRef.current.delete(roundNumber);
      },

      completeRegeneration: (roundNumber: number) => {
        dispatch({ type: 'COMPLETE_REGENERATION', payload: roundNumber });
        currentRoundNumberRef.current = null;
      },

      // Analysis tracking
      markAnalysisCreated: (roundNumber: number) => {
        createdAnalysisRoundsRef.current.add(roundNumber);
      },

      hasAnalysisBeenCreated: (roundNumber: number) => {
        return createdAnalysisRoundsRef.current.has(roundNumber);
      },

      clearAnalysisTracking: (roundNumber: number) => {
        createdAnalysisRoundsRef.current.delete(roundNumber);
      },
    }),
    [dispatch, currentRoundNumberRef, hasSentPendingMessageRef, createdAnalysisRoundsRef],
  );
}
