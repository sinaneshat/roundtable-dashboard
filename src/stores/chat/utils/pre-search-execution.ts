/**
 * Pre-Search Execution Helper
 *
 * Consolidates pre-search creation and execution logic that was duplicated
 * in chat-store-provider.tsx (handleComplete and pendingMessage effects).
 *
 * @module stores/chat/utils/pre-search-execution
 */

import type { UseMutationResult } from '@tanstack/react-query';

import { AnalysisStatuses, PreSearchSseEvents, WebSearchDepths } from '@/api/core/enums';
import type { PartialPreSearchData, PreSearchDataPayload, StoredPreSearch } from '@/api/routes/chat/schema';
import { PreSearchDataPayloadSchema } from '@/api/routes/chat/schema';
import { transformPreSearch } from '@/lib/utils/date-transforms';

import type { ChatStoreApi } from '../store';

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
  } catch {
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
        analysis: analysisRationale,
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
          } catch {
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
  } catch {
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
  createPreSearchMutation: UseMutationResult<
    { data: StoredPreSearch } | undefined,
    Error,
    { param: { threadId: string; roundNumber: string }; json: { userQuery: string } }
  >;
  /** ✅ PATTERN: Mutation's mutateAsync for SSE stream execution */
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
    createPreSearchMutation,
    executePreSearchMutateAsync,
    onQueryInvalidate,
  } = options;

  const state = store.getState();

  // Already complete - nothing to do
  if (existingPreSearch?.status === AnalysisStatuses.COMPLETE) {
    return 'complete';
  }

  // Already failed - nothing to do
  if (existingPreSearch?.status === AnalysisStatuses.FAILED) {
    return 'failed';
  }

  // Check if already triggered (prevents duplicate execution)
  if (state.hasPreSearchBeenTriggered(roundNumber)) {
    // Check if streaming
    if (existingPreSearch?.status === AnalysisStatuses.STREAMING) {
      return 'in_progress';
    }
    return 'in_progress';
  }

  // Mark as triggered BEFORE any async operations
  state.markPreSearchTriggered(roundNumber);

  // Determine if we need to create DB record
  const needsDbCreate = !existingPreSearch || existingPreSearch.id.startsWith('placeholder-');

  try {
    // Create DB record if needed
    if (needsDbCreate) {
      const createResponse = await createPreSearchMutation.mutateAsync({
        param: {
          threadId,
          roundNumber: roundNumber.toString(),
        },
        json: {
          userQuery,
        },
      });

      if (createResponse?.data) {
        const preSearchWithDates = transformPreSearch(createResponse.data);
        store.getState().addPreSearch({
          ...preSearchWithDates,
          status: AnalysisStatuses.STREAMING,
        });
      }
    } else {
      // Update existing to streaming
      store.getState().updatePreSearchStatus(roundNumber, AnalysisStatuses.STREAMING);
    }

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
      console.error('[executePreSearch] Pre-search execution failed:', response.status);
      store.getState().updatePreSearchStatus(roundNumber, AnalysisStatuses.FAILED);
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
      store.getState().updatePreSearchStatus(roundNumber, AnalysisStatuses.COMPLETE);
    }

    // Clear activity tracking
    store.getState().clearPreSearchActivity(roundNumber);

    // Invalidate queries for sync
    onQueryInvalidate();

    return 'complete';
  } catch (error) {
    console.error('[executePreSearch] Failed:', error);
    store.getState().clearPreSearchActivity(roundNumber);
    store.getState().clearPreSearchTracking(roundNumber);
    return 'failed';
  }
}

/**
 * Check if pre-search should block message sending
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

  // Pre-search in progress - wait
  if (
    preSearchForRound.status === AnalysisStatuses.PENDING
    || preSearchForRound.status === AnalysisStatuses.STREAMING
  ) {
    return true;
  }

  // Pre-search complete or failed - proceed
  return false;
}
