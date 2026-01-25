/**
 * Memory Events Query Hooks
 *
 * TanStack Query hooks for polling memory creation events after rounds complete
 * Memory events are stored in KV with 5 minute TTL
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { useAuthCheck } from '@/hooks/utils';
import { invalidationPatterns, queryKeys } from '@/lib/data/query-keys';
import type { GetThreadMemoryEventsResponse } from '@/services/api';
import { getThreadMemoryEventsService } from '@/services/api';

type MemoryEventData = NonNullable<GetThreadMemoryEventsResponse>;

type UseMemoryEventsPollingOptions = {
  threadId: string;
  roundNumber: number;
  projectId?: string | null;
  enabled?: boolean;
  onMemoriesFound?: (data: MemoryEventData) => void;
};

/**
 * Hook to poll for memory events after a round completes
 *
 * Polls the API every 3 seconds (max 5 attempts) to check if memories
 * were created for a specific round. When found, invalidates project memories
 * cache and calls the onMemoriesFound callback.
 *
 * @param options - Polling options
 * @param options.threadId - Thread ID to check
 * @param options.roundNumber - Round number to check
 * @param options.projectId - Project ID for cache invalidation
 * @param options.enabled - Enable/disable polling
 * @param options.onMemoriesFound - Callback when memories are found
 */
export function useMemoryEventsPolling({
  threadId,
  roundNumber,
  projectId,
  enabled = true,
  onMemoriesFound,
}: UseMemoryEventsPollingOptions) {
  const { isAuthenticated } = useAuthCheck();
  const queryClient = useQueryClient();
  const [pollCount, setPollCount] = useState(0);
  const foundRef = useRef(false);

  const MAX_POLLS = 5;
  const POLL_INTERVAL = 3000;

  const shouldPoll = enabled
    && isAuthenticated
    && !!threadId
    && roundNumber > 0
    && pollCount < MAX_POLLS
    && !foundRef.current;

  const { data, isFetching, error, isError } = useQuery({
    queryKey: queryKeys.threads.memoryEvents(threadId, roundNumber),
    queryFn: async () => {
      setPollCount(prev => prev + 1);
      return getThreadMemoryEventsService({
        param: { threadId },
        query: { roundNumber },
      });
    },
    staleTime: 0,
    gcTime: 60_000,
    enabled: shouldPoll,
    refetchInterval: shouldPoll ? POLL_INTERVAL : false,
    retry: false,
    throwOnError: false,
  });

  // Handle found memories
  useEffect(() => {
    if (!data || foundRef.current)
      return;

    const eventData = data;
    if (!eventData.memories || eventData.memories.length === 0)
      return;

    foundRef.current = true;

    // Invalidate project memories cache
    if (projectId) {
      void queryClient.invalidateQueries({
        queryKey: invalidationPatterns.projectMemories(projectId),
      });
    }

    // Call callback
    onMemoriesFound?.(eventData);
  }, [data, projectId, queryClient, onMemoriesFound]);

  // Reset state when round changes (intentional setState on mount/dependency change)
  useEffect(() => {
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Intentional reset
    setPollCount(0);
    foundRef.current = false;
  }, [threadId, roundNumber]);

  return {
    data,
    error,
    isError,
    isPolling: shouldPoll && isFetching,
    pollCount,
    maxPolls: MAX_POLLS,
    found: foundRef.current,
  };
}

/**
 * Hook to manually check for memory events (single fetch, no polling)
 */
export function useMemoryEventsQuery(
  threadId: string,
  roundNumber: number,
  enabled?: boolean,
) {
  const { isAuthenticated } = useAuthCheck();

  return useQuery({
    queryKey: queryKeys.threads.memoryEvents(threadId, roundNumber),
    queryFn: () => getThreadMemoryEventsService({
      param: { threadId },
      query: { roundNumber },
    }),
    staleTime: 30_000,
    gcTime: 60_000,
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!threadId && roundNumber > 0),
    retry: false,
    throwOnError: false,
  });
}
