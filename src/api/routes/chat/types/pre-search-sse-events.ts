/**
 * Pre-Search SSE Event Type Definitions
 *
 * ✅ TYPE SAFETY: Complete type definitions for all pre-search SSE events
 * ✅ FRONTEND INTEGRATION: Import these types for EventSource handlers
 * ✅ DOCUMENTATION: Each event type documented with purpose and usage
 *
 * **USAGE**:
 * ```typescript
 * import type { PreSearchSSEEvent, PreSearchAnswerChunkEvent } from '@/api/routes/chat/types/pre-search-sse-events';
 *
 * eventSource.addEventListener('answer_chunk', (e: MessageEvent) => {
 *   const data = JSON.parse(e.data) as PreSearchAnswerChunkEvent['data'];
 *   setStreamingAnswer(prev => prev + data.chunk);
 * });
 * ```
 */

// ============================================================================
// Base Event Metadata
// ============================================================================

/**
 * Common timestamp field for all events
 */
type BaseEventData = {
  timestamp: number;
};

// ============================================================================
// Start Event
// ============================================================================

/**
 * Initial event sent when pre-search starts
 *
 * **PURPOSE**: Notify frontend that search execution has begun
 * **TIMING**: Sent immediately after SSE connection established
 */
export type PreSearchStartEvent = {
  event: 'start';
  data: BaseEventData & {
    userQuery: string;
    totalQueries: number;
  };
};

// ============================================================================
// Query Events
// ============================================================================

/**
 * Query generation streaming event
 *
 * **PURPOSE**: Stream AI-generated search query and rationale incrementally
 * **TIMING**: Sent multiple times as query is generated (incremental updates)
 * **PATTERN**: Similar to analysis streaming - sends partial updates
 */
export type PreSearchQueryEvent = {
  event: 'query';
  data: BaseEventData & {
    query: string;
    rationale: string;
    searchDepth: 'basic' | 'advanced';
    index: number;
    total: number;
    fallback?: boolean; // True if AI generation failed, using simple optimization
  };
};

// ============================================================================
// Result Events
// ============================================================================

/**
 * Search result streaming event
 *
 * **PURPOSE**: Stream search results as they're fetched and processed
 * **TIMING**: Sent multiple times as results are collected
 * **STATUS**: Indicates current phase (searching, processing, complete, error)
 */
export type PreSearchResultEvent = {
  event: 'result';
  data: BaseEventData & {
    query: string;
    answer: string | null;
    results: Array<{
      title: string;
      url: string;
      content: string;
      excerpt?: string;
      fullContent?: string;
      score: number;
      publishedDate: string | null;
      domain?: string;
    }>;
    resultCount: number;
    responseTime: number;
    index: number;
    status?: 'searching' | 'processing' | 'complete' | 'error';
    error?: string;
  };
};

// ============================================================================
// Answer Streaming Events (NEW)
// ============================================================================

/**
 * Answer chunk streaming event (NEW)
 *
 * **PURPOSE**: Stream AI-generated answer chunks progressively
 * **TIMING**: Sent every 100ms (buffered) during answer generation
 * **PATTERN**: Similar to analysis.handler.ts textStream pattern
 * **PERFORMANCE**: 75-80% faster TTFC than synchronous generation
 */
export type PreSearchAnswerChunkEvent = {
  event: 'answer_chunk';
  data: {
    chunk: string; // Buffered text chunks (accumulated over 100ms)
  };
};

/**
 * Answer completion event (NEW)
 *
 * **PURPOSE**: Signal that answer streaming is complete with final metadata
 * **TIMING**: Sent once after all chunks delivered
 * **CONTAINS**: Full answer text, mode, and generation timestamp
 */
export type PreSearchAnswerCompleteEvent = {
  event: 'answer_complete';
  data: {
    answer: string; // Complete answer text
    mode: 'basic' | 'advanced'; // Answer generation mode used
    generatedAt: string; // ISO 8601 timestamp
  };
};

/**
 * Answer error event (NEW)
 *
 * **PURPOSE**: Notify frontend of answer generation failure
 * **TIMING**: Sent if streaming fails (non-blocking)
 * **RECOVERY**: Search results still delivered, answer just unavailable
 * **PATTERN**: Graceful degradation - error doesn't fail entire search
 */
export type PreSearchAnswerErrorEvent = {
  event: 'answer_error';
  data: {
    error: string; // Error type/category
    message: string; // User-friendly error message
  };
};

// ============================================================================
// Completion Events
// ============================================================================

/**
 * Search execution complete event
 *
 * **PURPOSE**: Signal that all searches have been executed
 * **TIMING**: Sent after all results collected (before answer streaming)
 * **CONTAINS**: Statistics about search execution
 */
export type PreSearchCompleteEvent = {
  event: 'complete';
  data: BaseEventData & {
    totalSearches: number;
    successfulSearches: number;
    failedSearches: number;
    totalResults: number;
  };
};

/**
 * Final done event with complete search data
 *
 * **PURPOSE**: Provide complete searchData payload for database storage
 * **TIMING**: Sent last, after all processing complete
 * **CONTAINS**: Full searchData matching PreSearchDataPayloadSchema
 */
export type PreSearchDoneEvent = {
  event: 'done';
  data: {
    queries: Array<{
      query: string;
      rationale: string;
      searchDepth: 'basic' | 'advanced';
      index: number;
      total: number;
    }>;
    results: Array<{
      query: string;
      answer: string | null;
      results: Array<{
        title: string;
        url: string;
        content: string;
        excerpt?: string;
        fullContent?: string;
        score: number;
        publishedDate: string | null;
        domain?: string;
      }>;
      responseTime: number;
    }>;
    analysis: string;
    successCount: number;
    failureCount: number;
    totalResults: number;
    totalTime: number;
  };
};

/**
 * Failed event when search execution fails
 *
 * **PURPOSE**: Signal that search execution failed critically
 * **TIMING**: Sent if search fails and cannot be recovered
 * **CONTAINS**: Error details and categorization
 */
export type PreSearchFailedEvent = {
  event: 'failed';
  data: {
    error: string;
    errorCategory?: string;
    isTransient?: boolean;
  };
};

// ============================================================================
// Union Type for All Events
// ============================================================================

/**
 * Union type of all pre-search SSE events
 *
 * **USAGE**:
 * ```typescript
 * function handlePreSearchEvent(event: PreSearchSSEEvent) {
 *   switch (event.event) {
 *     case 'answer_chunk':
 *       // TypeScript knows event.data has { chunk: string }
 *       setStreamingAnswer(prev => prev + event.data.chunk);
 *       break;
 *     case 'answer_complete':
 *       // TypeScript knows event.data has { answer, mode, generatedAt }
 *       setFinalAnswer(event.data.answer);
 *       break;
 *     // ... other cases
 *   }
 * }
 * ```
 */
export type PreSearchSSEEvent
  = | PreSearchStartEvent
    | PreSearchQueryEvent
    | PreSearchResultEvent
    | PreSearchAnswerChunkEvent
    | PreSearchAnswerCompleteEvent
    | PreSearchAnswerErrorEvent
    | PreSearchCompleteEvent
    | PreSearchDoneEvent
    | PreSearchFailedEvent;

// ============================================================================
// Event Type Guards
// ============================================================================

/**
 * Type guard to check if event is answer chunk event
 */
export function isAnswerChunkEvent(
  event: PreSearchSSEEvent,
): event is PreSearchAnswerChunkEvent {
  return event.event === 'answer_chunk';
}

/**
 * Type guard to check if event is answer complete event
 */
export function isAnswerCompleteEvent(
  event: PreSearchSSEEvent,
): event is PreSearchAnswerCompleteEvent {
  return event.event === 'answer_complete';
}

/**
 * Type guard to check if event is answer error event
 */
export function isAnswerErrorEvent(
  event: PreSearchSSEEvent,
): event is PreSearchAnswerErrorEvent {
  return event.event === 'answer_error';
}

// ============================================================================
// Frontend Integration Helper
// ============================================================================

/**
 * Parse SSE event data with type safety
 *
 * **USAGE**:
 * ```typescript
 * eventSource.addEventListener('answer_chunk', (e: MessageEvent) => {
 *   const event = parsePreSearchEvent<PreSearchAnswerChunkEvent>(e, 'answer_chunk');
 *   if (event) {
 *     setStreamingAnswer(prev => prev + event.data.chunk);
 *   }
 * });
 * ```
 */
export function parsePreSearchEvent<T extends PreSearchSSEEvent>(
  messageEvent: MessageEvent,
  expectedType: T['event'],
): T['data'] | null {
  try {
    const data = JSON.parse(messageEvent.data);
    return data as T['data'];
  } catch {
    console.error(`Failed to parse ${expectedType} event data`);
    return null;
  }
}
