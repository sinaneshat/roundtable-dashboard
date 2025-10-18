/**
 * Chat Feedback Query Hooks
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIME_PRESETS } from '@/lib/data/stale-times';
import { getThreadFeedbackService } from '@/services/api';

/**
 * Hook to fetch round feedback for a thread
 */
export function useThreadFeedbackQuery(threadId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.threads.feedback(threadId),
    queryFn: async () => {
      const response = await getThreadFeedbackService({
        param: { id: threadId },
      });

      if (!response.success) {
        throw new Error('Failed to fetch feedback');
      }

      return response.data;
    },
    staleTime: STALE_TIME_PRESETS.medium,
    enabled,
  });
}
