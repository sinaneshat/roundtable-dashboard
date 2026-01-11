'use client';

import { useQuery } from '@tanstack/react-query';

import { MessageStatuses } from '@/api/core/enums';
import { useAuthCheck } from '@/hooks/utils';
import { queryKeys } from '@/lib/data/query-keys';
import { POLLING_INTERVALS, STALE_TIMES } from '@/lib/data/stale-times';
import { getThreadPreSearchesService } from '@/services/api';

export function useThreadPreSearchesQuery(
  threadId: string,
  enabled?: boolean,
) {
  const { isAuthenticated } = useAuthCheck();

  const query = useQuery({
    queryKey: queryKeys.threads.preSearches(threadId),
    queryFn: () => getThreadPreSearchesService({ param: { id: threadId } }),
    staleTime: STALE_TIMES.preSearch,
    placeholderData: previousData => previousData,
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!threadId),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: (query) => {
      const hasPendingPreSearch = query.state.data?.data?.items?.some(
        ps => ps.status === MessageStatuses.PENDING,
      );
      return hasPendingPreSearch ? POLLING_INTERVALS.preSearchPending : false;
    },
    refetchIntervalInBackground: false,
  });

  return query;
}
