/**
 * Thread Round Summary Query Hooks
 *
 * TanStack Query hooks for thread round summary operations
 * Following patterns from TanStack Query v5 documentation
 *
 * IMPORTANT: staleTime values MUST match server-side prefetch values
 * See: docs/react-query-ssr-patterns.md
 */

'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { SummariesCacheResponse } from '@/api/routes/chat/schema';
import { useSession } from '@/lib/auth/client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import { getThreadSummariesService } from '@/services/api';

/**
 * Hook to fetch thread round summaries
 * Returns all round summaries ordered by round number
 * Protected endpoint - requires authentication
 *
 * ✅ AI SDK v5 PATTERN: Fetch completed summaries from database
 * - Used on page refresh to load persisted summaries
 * - Real-time streaming handled by experimental_useObject in RoundSummaryStream component
 * - SMART POLLING: Only polls for truly orphaned summaries (prevents overlap with active streaming)
 * - Query invalidated when summary completes (via onFinish callback)
 * - Query invalidated when round completes to fetch newly created pending summaries
 *
 * ⚠️ CRITICAL POLLING STRATEGY (Prevents Overlap):
 * - status='pending' → RoundSummaryStream handles via experimental_useObject (NO POLLING)
 * - status='streaming' + age < 2min → Active streaming in progress (NO POLLING - prevents overlap!)
 * - status='streaming' + age > 2min → Orphaned from page refresh (POLL every 10s to check completion)
 * - status='completed'/'failed' → No polling needed
 *
 * This ensures the query polling NEVER interferes with active experimental_useObject streaming,
 * while still detecting and completing orphaned summaries after page refresh.
 *
 * ✅ NAVIGATION RACE CONDITION FIX:
 * - When navigating from overview screen to thread page, pending summaries may exist in cache
 * - Server hasn't created them yet (summary streaming just started)
 * - Query fetch would return empty array and overwrite pending summaries
 * - Solution: Check cache before fetch, only return server data if cache is empty
 * - This preserves client-side pending summaries during navigation
 *
 * Pattern: Fetch persisted data, stream new data via experimental_useObject, poll for orphaned summaries
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-core/stream-object
 *
 * @param threadId - Thread ID
 * @param enabled - Optional control over whether to fetch (default: based on threadId and auth)
 */
export function useThreadSummariesQuery(threadId: string, enabled?: boolean) {
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;
  // ✅ FIX: Use useQueryClient() hook instead of getQueryClient()
  // Ensures we use the same QueryClient instance from React context
  // The queryClient is accessed via closure in queryFn
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.threads.summaries(threadId),
    queryFn: async ({ queryKey }) => {
      // ✅ NAVIGATION RACE CONDITION FIX: Merge server data with existing cache
      // When navigating from overview → thread page:
      // 1. Overview creates pending summary in cache (client-side, status='pending')
      // 2. Navigation happens immediately (summary streaming but not persisted)
      // 3. Thread page query fetches from server (returns empty - summary not persisted yet)
      // 4. Without merge, server's empty array would overwrite pending summary
      // 5. Solution: Check cache BEFORE fetch, merge server data with cached pending summaries

      // Get existing cache to check for pending/streaming summaries
      const cachedData = queryClient.getQueryData<SummariesCacheResponse>(queryKey);

      // Fetch from server
      const serverResponse = await getThreadSummariesService({ param: { id: threadId } });

      // If no cached pending/streaming summaries, return server response as-is
      if (!cachedData?.success || cachedData.data.items.length === 0) {
        return serverResponse;
      }

      // ✅ CRITICAL FIX: Extract ALL cached summaries that aren't on server yet
      // Not just pending/streaming - completed summaries might not be persisted yet!
      // When summary streaming completes, client marks it 'completed' but server
      // is still writing to DB. If we filter out completed, it disappears from UI.
      const serverRoundNumbers = new Set(
        serverResponse.data.items.map(item => item.roundNumber),
      );

      const cachedNotOnServer = cachedData.data.items.filter(
        item => !serverRoundNumbers.has(item.roundNumber),
      );

      if (cachedNotOnServer.length === 0) {
        return serverResponse;
      }

      // ✅ MERGE STRATEGY: Prefer server data, keep all cached summaries for rounds not on server
      if (serverResponse.success) {
        // Build final merged list:
        // 1. Use server data for rounds that exist on server (authoritative/persisted)
        // 2. Use cached summaries (any status) for rounds not yet on server
        // ✅ TYPE-SAFE: Use cache data item type (accepts both string/Date for timestamps)
        const mergedItems: SummariesCacheResponse['data']['items'] = [];
        const processedRounds = new Set<number>();

        // ✅ CRITICAL: Add all server summaries first (these are authoritative/completed)
        for (const serverItem of serverResponse.data.items) {
          mergedItems.push(serverItem);
          processedRounds.add(serverItem.roundNumber);
        }

        // ✅ CRITICAL: Add ALL cached summaries for rounds not on server (not just pending/streaming)
        // This preserves recently completed summaries that haven't been persisted yet
        for (const cachedItem of cachedNotOnServer) {
          if (!processedRounds.has(cachedItem.roundNumber)) {
            mergedItems.push(cachedItem);
            processedRounds.add(cachedItem.roundNumber);
          }
        }

        return {
          ...serverResponse,
          data: {
            ...serverResponse.data,
            items: mergedItems,
          },
        };
      }

      return serverResponse;
    },
    staleTime: STALE_TIMES.threadSummaries,
    // ✅ Keep placeholderData to prevent UI flicker during fetch
    placeholderData: previousData => previousData,
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!threadId),
    retry: false,
    throwOnError: false,
  });

  return query;
}
