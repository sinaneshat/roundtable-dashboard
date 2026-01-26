import { MessageStatuses } from '@roundtable/shared';
import { useQuery } from '@tanstack/react-query';

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
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!threadId),
    placeholderData: previousData => previousData,
    queryFn: () => getThreadPreSearchesService({ param: { id: threadId } }),
    queryKey: queryKeys.threads.preSearches(threadId),
    refetchInterval: (query) => {
      // ✅ Stop polling on error to prevent infinite error loops
      if (query.state.status === 'error') {
        return false;
      }
      const items = query.state.data?.data?.items;
      const hasPendingPreSearch = items?.some(
        (ps: { status: string }) => ps.status === MessageStatuses.PENDING,
      );
      return hasPendingPreSearch ? POLLING_INTERVALS.preSearchPending : false;
    },
    refetchIntervalInBackground: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: STALE_TIMES.preSearch,
    throwOnError: false,
  });

  return query;
}
