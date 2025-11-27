/**
 * Pre-Search Execution Helper
 *
 * Consolidates pre-search creation and execution logic that was duplicated
 * in chat-store-provider.tsx (handleComplete and pendingMessage effects).
 *
 * @module stores/chat/utils/pre-search-execution
 */

import type { UseMutationResult } from '@tanstack/react-query';
import type { z } from 'zod';

import { AnalysisStatuses, PreSearchSseEvents } from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import { PreSearchDataPayloadSchema } from '@/api/routes/chat/schema';
import { transformPreSearch } from '@/lib/utils/date-transforms';

import type { ChatStoreApi } from '../store';

/** Type inferred from schema - single source of truth */
type PreSearchDataPayload = z.infer<typeof PreSearchDataPayloadSchema>;

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
 * Calls onActivity callback for each chunk received (timeout tracking)
 */
export async function readPreSearchStreamData(
  response: Response,
  onActivity?: () => void,
): Promise<PreSearchDataPayload | null> {
  const reader = response.body?.getReader();
  if (!reader)
    return null;

  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';
  let currentData = '';
  let searchData: PreSearchDataPayload | null = null;

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
          if (currentEvent === PreSearchSseEvents.DONE) {
            searchData = parsePreSearchData(currentData);
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
 * Options for pre-search execution
 */
export type ExecutePreSearchOptions = {
  store: ChatStoreApi;
  threadId: string;
  roundNumber: number;
  userQuery: string;
  existingPreSearch: StoredPreSearch | null;
  createPreSearchMutation: UseMutationResult<
    { data: StoredPreSearch } | undefined,
    Error,
    { param: { threadId: string; roundNumber: string }; json: { userQuery: string } }
  >;
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
    existingPreSearch,
    createPreSearchMutation,
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

    // Execute pre-search API
    const response = await fetch(
      `/api/v1/chat/threads/${threadId}/rounds/${roundNumber}/pre-search`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({ userQuery }),
      },
    );

    if (!response.ok && response.status !== 409) {
      console.error('[executePreSearch] Pre-search execution failed:', response.status);
      store.getState().updatePreSearchStatus(roundNumber, AnalysisStatuses.FAILED);
      store.getState().clearPreSearchActivity(roundNumber);
      store.getState().clearPreSearchTracking(roundNumber);
      return 'failed';
    }

    // Parse SSE stream and extract data
    const searchData = await readPreSearchStreamData(response, () => {
      store.getState().updatePreSearchActivity(roundNumber);
    });

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
