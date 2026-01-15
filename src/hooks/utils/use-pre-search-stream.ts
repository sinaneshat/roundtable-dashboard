/**
 * Pre-Search Stream Utilities
 *
 * Utility hooks for SSE streaming and polling in pre-search components.
 * These wrap direct service calls that require special handling (SSE, polling).
 */

'use client';

import { useCallback } from 'react';

import { executePreSearchStreamService, getThreadPreSearchesService } from '@/services/api';
import type { PreSearchRequest } from '@/services/api/chat/pre-search';

/**
 * Hook for executing pre-search SSE stream
 * Wraps the raw service call for SSE handling
 */
export function useExecutePreSearchStream() {
  return useCallback(async (data: PreSearchRequest) => {
    return executePreSearchStreamService(data);
  }, []);
}

/**
 * Hook for polling pre-search results
 * Used as fallback when SSE stream encounters 409 conflict
 */
export function useGetThreadPreSearchesForPolling() {
  return useCallback(async (threadId: string) => {
    return getThreadPreSearchesService({ param: { id: threadId } });
  }, []);
}
