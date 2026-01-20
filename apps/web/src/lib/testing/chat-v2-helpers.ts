/**
 * Chat V2 Testing Helpers
 *
 * Utilities for testing the V2 chat flow state machine and SSE parsing.
 * Includes store factories, mock SSE responses, and flow simulation helpers.
 */

import { MessageStatuses, PreSearchSseEvents } from '@roundtable/shared';
import type { UIMessage } from 'ai';

import type { ChatStoreApi, FlowContext, FlowState, PreSearchResult } from '@/stores/chat-v2';
import { createChatStore, INITIAL_FLOW_STATE } from '@/stores/chat-v2';

// ============================================================================
// TYPE ALIASES
// ============================================================================

export type PartialChatV2State = Partial<ReturnType<ChatStoreApi['getState']>>;

// ============================================================================
// V2 STORE FACTORY
// ============================================================================

/**
 * Create test V2 chat store with optional initial state
 */
export function createTestChatStoreV2(initialState: PartialChatV2State = {}): ChatStoreApi {
  const store = createChatStore();

  if (Object.keys(initialState).length > 0) {
    store.setState(initialState);
  }

  return store;
}

/**
 * Reset V2 store to default state
 */
export function resetV2StoreToDefaults(store: ChatStoreApi): void {
  const defaultState = createChatStore().getState();
  store.setState(defaultState);
}

// ============================================================================
// FLOW CONTEXT FACTORY
// ============================================================================

/**
 * Create test flow context with defaults
 */
export function createTestFlowContext(overrides?: Partial<FlowContext>): FlowContext {
  return {
    enableWebSearch: false,
    participantCount: 2,
    hasPreSearchForRound: () => false,
    isPreSearchComplete: () => false,
    ...overrides,
  };
}

// ============================================================================
// FLOW STATE FACTORIES
// ============================================================================

/**
 * Create idle flow state
 */
export function createIdleFlowState(): FlowState {
  return INITIAL_FLOW_STATE;
}

/**
 * Create creating_thread flow state
 */
export function createCreatingThreadState(overrides?: {
  message?: string;
  mode?: 'auto' | 'council' | 'debate';
  participants?: Array<{ modelId: string; role: string | null }>;
}): FlowState {
  return {
    type: 'creating_thread',
    message: overrides?.message ?? 'Test message',
    mode: overrides?.mode ?? 'council',
    participants: overrides?.participants ?? [{ modelId: 'gpt-4', role: null }],
  };
}

/**
 * Create pre_search flow state
 */
export function createPreSearchFlowState(overrides?: {
  threadId?: string;
  round?: number;
}): FlowState {
  return {
    type: 'pre_search',
    threadId: overrides?.threadId ?? 'test-thread-id',
    round: overrides?.round ?? 0,
  };
}

/**
 * Create streaming flow state
 */
export function createStreamingFlowState(overrides?: {
  threadId?: string;
  round?: number;
  participantIndex?: number;
  totalParticipants?: number;
}): FlowState {
  return {
    type: 'streaming',
    threadId: overrides?.threadId ?? 'test-thread-id',
    round: overrides?.round ?? 0,
    participantIndex: overrides?.participantIndex ?? 0,
    totalParticipants: overrides?.totalParticipants ?? 2,
  };
}

/**
 * Create awaiting_moderator flow state
 */
export function createAwaitingModeratorFlowState(overrides?: {
  threadId?: string;
  round?: number;
}): FlowState {
  return {
    type: 'awaiting_moderator',
    threadId: overrides?.threadId ?? 'test-thread-id',
    round: overrides?.round ?? 0,
  };
}

/**
 * Create moderator_streaming flow state
 */
export function createModeratorStreamingFlowState(overrides?: {
  threadId?: string;
  round?: number;
}): FlowState {
  return {
    type: 'moderator_streaming',
    threadId: overrides?.threadId ?? 'test-thread-id',
    round: overrides?.round ?? 0,
  };
}

/**
 * Create round_complete flow state
 */
export function createRoundCompleteFlowState(overrides?: {
  threadId?: string;
  round?: number;
}): FlowState {
  return {
    type: 'round_complete',
    threadId: overrides?.threadId ?? 'test-thread-id',
    round: overrides?.round ?? 0,
  };
}

/**
 * Create updating_thread flow state
 */
export function createUpdatingThreadFlowState(overrides?: {
  threadId?: string;
  round?: number;
  message?: string;
  hasConfigChanges?: boolean;
}): FlowState {
  return {
    type: 'updating_thread',
    threadId: overrides?.threadId ?? 'test-thread-id',
    round: overrides?.round ?? 1,
    message: overrides?.message ?? 'Follow-up message',
    hasConfigChanges: overrides?.hasConfigChanges ?? false,
  };
}

/**
 * Create awaiting_changelog flow state
 */
export function createAwaitingChangelogFlowState(overrides?: {
  threadId?: string;
  round?: number;
}): FlowState {
  return {
    type: 'awaiting_changelog',
    threadId: overrides?.threadId ?? 'test-thread-id',
    round: overrides?.round ?? 1,
  };
}

/**
 * Create error flow state
 */
export function createErrorFlowState(overrides?: {
  threadId?: string;
  round?: number;
  error?: string;
}): FlowState {
  return {
    type: 'error',
    ...(overrides?.threadId && { threadId: overrides.threadId }),
    ...(overrides?.round !== undefined && { round: overrides.round }),
    error: overrides?.error ?? 'Test error',
  };
}

// ============================================================================
// SSE MOCK HELPERS
// ============================================================================

type SSEEvent = {
  event?: string;
  data: string;
};

/**
 * Create mock SSE response body for testing
 */
export function createMockSSEResponse(events: SSEEvent[]): string {
  return events.map((e) => {
    const lines: string[] = [];
    if (e.event) {
      lines.push(`event: ${e.event}`);
    }
    lines.push(`data: ${e.data}`);
    lines.push(''); // Empty line to signal event completion
    return lines.join('\n');
  }).join('\n');
}

/**
 * Create mock fetch response for SSE stream
 */
export function createMockSSEFetchResponse(events: SSEEvent[]): Response {
  const body = createMockSSEResponse(events);
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

/**
 * Create chunked SSE response for testing buffer handling
 */
export function createChunkedSSEFetchResponse(events: SSEEvent[], chunkSize: number): Response {
  const body = createMockSSEResponse(events);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(body);

  const stream = new ReadableStream({
    start(controller) {
      let offset = 0;
      const pushChunk = () => {
        if (offset < bytes.length) {
          const chunk = bytes.slice(offset, offset + chunkSize);
          controller.enqueue(chunk);
          offset += chunkSize;
          setTimeout(pushChunk, 0);
        } else {
          controller.close();
        }
      };
      pushChunk();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

// ============================================================================
// PRE-SEARCH SSE EVENT FACTORIES
// ============================================================================

/**
 * Create pre-search result SSE event
 */
export function createPreSearchResultEvent(data: {
  query: string;
  results: Array<{ title: string; url: string; snippet?: string }>;
}): SSEEvent {
  return {
    event: PreSearchSseEvents.RESULT,
    data: JSON.stringify(data),
  };
}

/**
 * Create pre-search done SSE event
 */
export function createPreSearchDoneEvent(data: {
  queries?: Array<{ query: string }>;
  results?: Array<{ title: string; url: string; snippet?: string }>;
}): SSEEvent {
  return {
    event: PreSearchSseEvents.DONE,
    data: JSON.stringify(data),
  };
}

// ============================================================================
// MODERATOR SSE EVENT FACTORIES
// ============================================================================

/**
 * Create moderator message SSE event (AI SDK format)
 */
export function createModeratorMessageEvent(message: UIMessage): SSEEvent {
  return {
    data: JSON.stringify({ type: 'message', message }),
  };
}

/**
 * Create moderator done SSE event (AI SDK format)
 */
export function createModeratorDoneEvent(): SSEEvent {
  return {
    data: JSON.stringify({ type: 'done' }),
  };
}

// ============================================================================
// PRE-SEARCH RESULT FACTORIES
// ============================================================================

/**
 * Create test pre-search result
 */
export function createTestPreSearchResult(overrides?: Partial<PreSearchResult>): PreSearchResult {
  return {
    roundNumber: 0,
    status: MessageStatuses.COMPLETE,
    query: 'test query',
    results: [
      { title: 'Test Result 1', url: 'https://example.com/1', snippet: 'Test snippet 1' },
      { title: 'Test Result 2', url: 'https://example.com/2', snippet: 'Test snippet 2' },
    ],
    startedAt: Date.now() - 1000,
    completedAt: Date.now(),
    ...overrides,
  };
}

/**
 * Create pending pre-search result
 */
export function createPendingPreSearchResult(roundNumber: number): PreSearchResult {
  return {
    roundNumber,
    status: MessageStatuses.PENDING,
    query: null,
    results: null,
    startedAt: Date.now(),
    completedAt: null,
  };
}

/**
 * Create streaming pre-search result
 */
export function createStreamingPreSearchResult(roundNumber: number, query?: string): PreSearchResult {
  return {
    roundNumber,
    status: MessageStatuses.STREAMING,
    query: query ?? 'test query',
    results: null,
    startedAt: Date.now(),
    completedAt: null,
  };
}

// ============================================================================
// MESSAGE FACTORIES
// ============================================================================

/**
 * Create test user message for V2 store
 */
export function createV2UserMessage(overrides?: {
  id?: string;
  roundNumber?: number;
  content?: string;
}): UIMessage {
  return {
    id: overrides?.id ?? `user-${Date.now()}`,
    role: 'user',
    parts: [{ type: 'text', text: overrides?.content ?? 'Test user message' }],
    metadata: {
      role: 'user',
      roundNumber: overrides?.roundNumber ?? 0,
    },
  };
}

/**
 * Create test assistant message for V2 store
 */
export function createV2AssistantMessage(overrides?: {
  id?: string;
  roundNumber?: number;
  participantIndex?: number;
  content?: string;
  isModerator?: boolean;
}): UIMessage {
  const metadata: Record<string, unknown> = {
    role: 'assistant',
    roundNumber: overrides?.roundNumber ?? 0,
  };

  if (overrides?.isModerator) {
    metadata.isModerator = true;
  } else {
    metadata.participantIndex = overrides?.participantIndex ?? 0;
  }

  return {
    id: overrides?.id ?? `assistant-${Date.now()}`,
    role: 'assistant',
    parts: [{ type: 'text', text: overrides?.content ?? 'Test assistant message' }],
    metadata,
  };
}

/**
 * Create test moderator message for V2 store
 */
export function createV2ModeratorMessage(overrides?: {
  id?: string;
  roundNumber?: number;
  content?: string;
}): UIMessage {
  return createV2AssistantMessage({
    ...overrides,
    isModerator: true,
  });
}

// ============================================================================
// ROUND SIMULATION HELPERS
// ============================================================================

/**
 * Simulate a complete round in the store
 * Adds user message, participant messages, and moderator message
 */
export function simulateCompleteRound(
  store: ChatStoreApi,
  round: number,
  participantCount: number = 2,
): void {
  const state = store.getState();
  const messages: UIMessage[] = [...state.messages];

  // Add user message
  messages.push(createV2UserMessage({
    id: `user-round-${round}`,
    roundNumber: round,
    content: `User message for round ${round}`,
  }));

  // Add participant messages
  for (let i = 0; i < participantCount; i++) {
    messages.push(createV2AssistantMessage({
      id: `assistant-round-${round}-p${i}`,
      roundNumber: round,
      participantIndex: i,
      content: `Participant ${i} message for round ${round}`,
    }));
  }

  // Add moderator message
  messages.push(createV2ModeratorMessage({
    id: `moderator-round-${round}`,
    roundNumber: round,
    content: `Moderator summary for round ${round}`,
  }));

  store.setState({
    messages,
    flow: createRoundCompleteFlowState({ round }),
  });
}

/**
 * Simulate an incomplete round (no moderator)
 */
export function simulateIncompleteRound(
  store: ChatStoreApi,
  round: number,
  completedParticipants: number = 0,
  totalParticipants: number = 2,
): void {
  const state = store.getState();
  const messages: UIMessage[] = [...state.messages];

  // Add user message
  messages.push(createV2UserMessage({
    id: `user-round-${round}`,
    roundNumber: round,
    content: `User message for round ${round}`,
  }));

  // Add completed participant messages
  for (let i = 0; i < completedParticipants; i++) {
    messages.push(createV2AssistantMessage({
      id: `assistant-round-${round}-p${i}`,
      roundNumber: round,
      participantIndex: i,
      content: `Participant ${i} message for round ${round}`,
    }));
  }

  store.setState({
    messages,
    flow: completedParticipants < totalParticipants
      ? createStreamingFlowState({
          round,
          participantIndex: completedParticipants,
          totalParticipants,
        })
      : createAwaitingModeratorFlowState({ round }),
  });
}

// ============================================================================
// MOCK FETCH HELPERS
// ============================================================================

/**
 * Create a mock fetch function for SSE endpoints
 */
export function createMockFetchForSSE(
  responses: Map<string, SSEEvent[]>,
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();

    // Check if this URL matches any of our mocked endpoints
    for (const [pattern, events] of responses.entries()) {
      if (url.includes(pattern)) {
        // Check for abort
        if (init?.signal?.aborted) {
          const error = new Error('The operation was aborted.');
          error.name = 'AbortError';
          throw error;
        }

        return createMockSSEFetchResponse(events);
      }
    }

    // If no match, return a 404
    return new Response(null, { status: 404 });
  };
}

// ============================================================================
// ASYNC TEST HELPERS
// ============================================================================

/**
 * Wait for store state to match a condition
 */
export async function waitForStoreCondition(
  store: ChatStoreApi,
  condition: (state: ReturnType<ChatStoreApi['getState']>) => boolean,
  timeout: number = 5000,
): Promise<void> {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    // Check immediately
    if (condition(store.getState())) {
      resolve();
      return;
    }

    // Subscribe to changes
    const unsubscribe = store.subscribe((state) => {
      if (condition(state)) {
        unsubscribe();
        resolve();
      } else if (Date.now() - startTime > timeout) {
        unsubscribe();
        reject(new Error('Timeout waiting for store condition'));
      }
    });

    // Timeout fallback
    setTimeout(() => {
      unsubscribe();
      reject(new Error('Timeout waiting for store condition'));
    }, timeout);
  });
}

/**
 * Wait for flow state to reach a specific type
 */
export async function waitForFlowState(
  store: ChatStoreApi,
  flowType: FlowState['type'],
  timeout: number = 5000,
): Promise<void> {
  return waitForStoreCondition(
    store,
    state => state.flow.type === flowType,
    timeout,
  );
}
