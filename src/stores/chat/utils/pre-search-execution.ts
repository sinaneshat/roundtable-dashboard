/**
 * Pre-Search Execution Helper
 *
 * Consolidates pre-search creation and execution logic that was duplicated
 * in chat-store-provider.tsx (handleComplete and pendingMessage effects).
 *
 * @module stores/chat/utils/pre-search-execution
 */

import { Environments, MessageStatuses, PreSearchSseEvents, WebSearchDepths } from '@/api/core/enums';
import type { ChatThread, PartialPreSearchData, PreSearchDataPayload, StoredPreSearch } from '@/api/routes/chat/schema';
import { PreSearchDataPayloadSchema } from '@/api/routes/chat/schema';

import type { ChatStoreApi } from '../store';

/**
 * Get effective web search enabled state from thread (single source of truth).
 * Thread state is THE source of truth for all decisions after thread exists.
 * Form state only used for new chats before thread is created.
 *
 * @param thread - The chat thread (null before thread creation)
 * @param formEnableWebSearch - Form state (only used if thread is null)
 * @returns boolean - true if web search enabled, false otherwise
 */
export function getEffectiveWebSearchEnabled(
  thread: ChatThread | null,
  formEnableWebSearch: boolean,
): boolean {
  // Thread exists = thread is source of truth
  if (thread) {
    return thread.enableWebSearch;
  }
  // No thread yet = form state (user's intent for new chat)
  return formEnableWebSearch;
}

/**
 * Parse and validate pre-search data from SSE stream
 * ✅ TYPE-SAFE: Uses Zod schema validation instead of manual type casting
 */
function parsePreSearchData(jsonString: string): PreSearchDataPayload | null {
  try {
    const parsed: unknown = JSON.parse(jsonString);
    // ✅ PATTERN: Use Zod safeParse for type-safe validation
    const result = PreSearchDataPayloadSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    return null;
  } catch (error) {
    console.error('[parsePreSearchData] Failed to parse pre-search data:', error);
    return null;
  }
}

/**
 * Read SSE stream and extract pre-search data
 * ✅ PROGRESSIVE UI: Now supports onPartialUpdate for gradual UI updates
 * Calls onActivity callback for each chunk received (timeout tracking)
 * Calls onPartialUpdate with accumulated partial data as QUERY/RESULT events arrive
 */
export async function readPreSearchStreamData(
  response: Response,
  onActivity?: () => void,
  onPartialUpdate?: (partialData: PartialPreSearchData) => void,
): Promise<PreSearchDataPayload | null> {
  const reader = response.body?.getReader();
  if (!reader)
    return null;

  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';
  let currentData = '';
  let searchData: PreSearchDataPayload | null = null;

  // ✅ PROGRESSIVE UI: Accumulate partial data using Maps to avoid sparse arrays
  const queriesMap = new Map<number, PartialPreSearchData['queries'][number]>();
  const resultsMap = new Map<number, PartialPreSearchData['results'][number]>();
  let analysisRationale: string | undefined;

  // Helper to build and emit partial update
  const emitPartialUpdate = () => {
    if (!onPartialUpdate)
      return;

    const queries = Array.from(queriesMap.values()).sort((a, b) => a.index - b.index);
    const results = Array.from(resultsMap.values()).sort((a, b) => a.index - b.index);

    if (queries.length > 0 || results.length > 0) {
      onPartialUpdate({
        queries,
        results,
        summary: analysisRationale,
      });
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done)
        break;

      onActivity?.();

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          currentData = line.slice(5).trim();
        } else if (line === '' && currentEvent && currentData) {
          // ✅ PROGRESSIVE UI: Process intermediate events
          try {
            if (currentEvent === PreSearchSseEvents.START) {
              const startData = JSON.parse(currentData);
              if (startData.analysisRationale) {
                analysisRationale = startData.analysisRationale;
              }
            } else if (currentEvent === PreSearchSseEvents.QUERY) {
              const queryData = JSON.parse(currentData);
              queriesMap.set(queryData.index, {
                query: queryData.query || '',
                rationale: queryData.rationale || '',
                searchDepth: queryData.searchDepth || WebSearchDepths.BASIC,
                index: queryData.index,
                total: queryData.total || 1,
              });
              emitPartialUpdate();
            } else if (currentEvent === PreSearchSseEvents.RESULT) {
              const resultData = JSON.parse(currentData);
              resultsMap.set(resultData.index, {
                query: resultData.query || '',
                answer: resultData.answer || null,
                results: resultData.results || [],
                responseTime: resultData.responseTime || 0,
                index: resultData.index,
              });
              emitPartialUpdate();
            } else if (currentEvent === PreSearchSseEvents.DONE) {
              searchData = parsePreSearchData(currentData);
            }
          } catch (error) {
            console.error('[readPreSearchStreamData] Failed to parse event data:', error);
            // Failed to parse event data, continue
          }
          currentEvent = '';
          currentData = '';
        }
      }
    }

    // Process remaining buffer
    if (currentEvent === PreSearchSseEvents.DONE && currentData) {
      searchData = parsePreSearchData(currentData);
    }
  } catch (error) {
    console.error('[readPreSearchStreamData] Stream error:', error);
    // Stream error - return what we have
  }

  return searchData;
}

/**
 * Type for pre-search stream execution mutation
 * ✅ PATTERN: Accepts mutation's mutateAsync instead of direct service import
 */
export type ExecutePreSearchStreamMutateAsync = (params: {
  param: { threadId: string; roundNumber: string };
  json: { userQuery: string; fileContext?: string };
}) => Promise<Response>;

/**
 * Options for pre-search execution
 * ✅ PATTERN: Uses mutation's mutateAsync instead of direct service import
 */
export type ExecutePreSearchOptions = {
  store: ChatStoreApi;
  threadId: string;
  roundNumber: number;
  userQuery: string;
  /** Optional extracted text content from uploaded files to include in search query generation */
  fileContext?: string;
  existingPreSearch: StoredPreSearch | null;
  /** ✅ PATTERN: Mutation's mutateAsync for SSE stream execution - auto-creates DB record */
  executePreSearchMutateAsync: ExecutePreSearchStreamMutateAsync;
  onQueryInvalidate: () => void;
};

/**
 * Execute pre-search creation and streaming in a single, idempotent operation.
 *
 * This consolidates the duplicate logic that was in both handleComplete and
 * pendingMessage effects. Returns true if pre-search was started, false if
 * already complete or in progress.
 *
 * @returns Promise<'started' | 'in_progress' | 'complete' | 'failed'>
 */
export async function executePreSearch(
  options: ExecutePreSearchOptions,
): Promise<'started' | 'in_progress' | 'complete' | 'failed'> {
  const {
    store,
    threadId,
    roundNumber,
    userQuery,
    fileContext,
    existingPreSearch,
    executePreSearchMutateAsync,
    onQueryInvalidate,
  } = options;

  const state = store.getState();

  // Already complete - nothing to do
  if (existingPreSearch?.status === MessageStatuses.COMPLETE) {
    return 'complete';
  }

  // Already failed - nothing to do
  if (existingPreSearch?.status === MessageStatuses.FAILED) {
    return 'failed';
  }

  // Check if already triggered (prevents duplicate execution)
  if (state.hasPreSearchBeenTriggered(roundNumber)) {
    // Check if streaming
    if (existingPreSearch?.status === MessageStatuses.STREAMING) {
      return 'in_progress';
    }
    return 'in_progress';
  }

  // Mark as triggered BEFORE any async operations
  state.markPreSearchTriggered(roundNumber);

  try {
    // Update status to STREAMING - execute endpoint auto-creates DB record
    store.getState().updatePreSearchStatus(roundNumber, MessageStatuses.STREAMING);

    // ✅ PATTERN: Use mutation instead of direct service import
    // ✅ FILE CONTEXT: Pass file content for query generation consideration
    const response = await executePreSearchMutateAsync({
      param: {
        threadId,
        roundNumber: roundNumber.toString(),
      },
      json: {
        userQuery,
        ...(fileContext && { fileContext }),
      },
    });

    // ✅ POLLING: 202 means stream active but KV buffer not available
    // Return 'in_progress' so caller knows to poll for completion
    if (response.status === 202) {
      return 'in_progress';
    }

    // ✅ CONFLICT: 409 means another stream already active
    if (response.status === 409) {
      return 'in_progress';
    }

    if (!response.ok) {
      if (process.env.NODE_ENV === Environments.DEVELOPMENT) {
        console.error('[executePreSearch] Pre-search execution failed:', response.status);
      }
      store.getState().updatePreSearchStatus(roundNumber, MessageStatuses.FAILED);
      store.getState().clearPreSearchActivity(roundNumber);
      store.getState().clearPreSearchTracking(roundNumber);
      return 'failed';
    }

    // Parse SSE stream and extract data with progressive UI updates
    const searchData = await readPreSearchStreamData(
      response,
      () => {
        store.getState().updatePreSearchActivity(roundNumber);
      },
      (partialData) => {
        // ✅ PROGRESSIVE UI: Update store with each query/result as it streams
        store.getState().updatePartialPreSearchData(roundNumber, partialData);
      },
    );

    // Update store with results
    if (searchData) {
      store.getState().updatePreSearchData(roundNumber, searchData);
    } else {
      store.getState().updatePreSearchStatus(roundNumber, MessageStatuses.COMPLETE);
    }

    // Clear activity tracking
    store.getState().clearPreSearchActivity(roundNumber);

    // Invalidate queries for sync
    onQueryInvalidate();

    return 'complete';
  } catch (error) {
    if (process.env.NODE_ENV === Environments.DEVELOPMENT) {
      console.error('[executePreSearch] Failed:', error);
    }
    store.getState().clearPreSearchActivity(roundNumber);
    store.getState().clearPreSearchTracking(roundNumber);
    return 'failed';
  }
}

/**
 * ✅ RESUMPTION FIX: Maximum time to wait for a STREAMING pre-search after page refresh
 * After this duration from createdAt, consider the pre-search "effectively complete" for
 * resumption purposes. This prevents indefinite blocking when pre-search stream was
 * interrupted by page refresh.
 */
const STALE_STREAMING_TIMEOUT_MS = 15_000; // 15 seconds

/**
 * Check if pre-search should block message sending
 *
 * ✅ RESUMPTION FIX: Added timeout-based fallback for stale STREAMING status.
 * After page refresh, a pre-search might be stuck in STREAMING status if the stream
 * was interrupted. We now check the age of STREAMING pre-searches and allow proceeding
 * if they've been in that state too long (likely stale from before refresh).
 *
 * @returns true if message sending should wait for pre-search
 */
export function shouldWaitForPreSearch(
  webSearchEnabled: boolean,
  preSearchForRound: StoredPreSearch | undefined,
): boolean {
  if (!webSearchEnabled) {
    return false;
  }

  // No pre-search yet - need to create and wait
  if (!preSearchForRound) {
    return true;
  }

  // Pre-search in progress - check if stale
  if (
    preSearchForRound.status === MessageStatuses.PENDING
    || preSearchForRound.status === MessageStatuses.STREAMING
  ) {
    // ✅ RESUMPTION FIX: Check if STREAMING status is stale (from before page refresh)
    // If pre-search has been "streaming" for too long, it's likely stale and we should
    // not block resumption. The actual pre-search resumption/retry logic will handle it.
    if (preSearchForRound.status === MessageStatuses.STREAMING) {
      const createdTime = preSearchForRound.createdAt instanceof Date
        ? preSearchForRound.createdAt.getTime()
        : new Date(preSearchForRound.createdAt).getTime();
      const elapsed = Date.now() - createdTime;

      // If streaming for too long, treat as "don't block" - let resumption proceed
      // The pre-search resumption hook will handle re-executing or completing it
      if (elapsed > STALE_STREAMING_TIMEOUT_MS) {
        return false;
      }
    }

    return true;
  }

  // Pre-search complete or failed - proceed
  return false;
}
