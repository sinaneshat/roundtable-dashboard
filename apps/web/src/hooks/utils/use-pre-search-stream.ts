/**
 * Pre-Search Stream Utilities
 *
 * Utility hooks for polling pre-search results.
 * SSE streaming is handled by useEntitySubscription via subscribeToPreSearchStreamService.
 */

import { useCallback } from 'react';

import { getThreadPreSearchesService } from '@/services/api';

/**
 * Hook for polling pre-search results
 * Used as fallback when SSE stream encounters 409 conflict
 */
export function useGetThreadPreSearchesForPolling() {
  return useCallback(async (threadId: string) => {
    return getThreadPreSearchesService({ param: { id: threadId } });
  }, []);
}
