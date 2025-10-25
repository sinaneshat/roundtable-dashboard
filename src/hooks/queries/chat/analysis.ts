/**
 * Thread Moderator Analysis Query Hooks
 *
 * TanStack Query hooks for thread moderator analysis operations
 * Following patterns from TanStack Query v5 documentation
 *
 * IMPORTANT: staleTime values MUST match server-side prefetch values
 * See: docs/react-query-ssr-patterns.md
 */

'use client';

import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/lib/auth/client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import { AnalysisStatusSchema } from '@/lib/schemas/error-schemas';
import { getThreadAnalysesService } from '@/services/api';

/**
 * Hook to fetch thread moderator analyses
 * Returns all moderator analyses ordered by round number
 * Protected endpoint - requires authentication
 *
 * ✅ AI SDK v5 PATTERN: Fetch completed analyses from database
 * - Used on page refresh to load persisted analyses
 * - Real-time streaming handled by experimental_useObject in ModeratorAnalysisStream component
 * - SMART POLLING: Only polls for truly orphaned analyses (prevents overlap with active streaming)
 * - Query invalidated when analysis completes (via onFinish callback)
 * - Query invalidated when round completes to fetch newly created pending analyses
 *
 * ⚠️ CRITICAL POLLING STRATEGY (Prevents Overlap):
 * - status='pending' → ModeratorAnalysisStream handles via experimental_useObject (NO POLLING)
 * - status='streaming' + age < 2min → Active streaming in progress (NO POLLING - prevents overlap!)
 * - status='streaming' + age > 2min → Orphaned from page refresh (POLL every 10s to check completion)
 * - status='completed'/'failed' → No polling needed
 *
 * This ensures the query polling NEVER interferes with active experimental_useObject streaming,
 * while still detecting and completing orphaned analyses after page refresh.
 *
 * ✅ NAVIGATION RACE CONDITION FIX:
 * - When navigating from overview screen to thread page, pending analyses may exist in cache
 * - Server hasn't created them yet (analysis streaming just started)
 * - Query fetch would return empty array and overwrite pending analyses
 * - Solution: Check cache before fetch, only return server data if cache is empty
 * - This preserves client-side pending analyses during navigation
 *
 * Pattern: Fetch persisted data, stream new data via experimental_useObject, poll for orphaned analyses
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-core/stream-object
 *
 * @param threadId - Thread ID
 * @param enabled - Optional control over whether to fetch (default: based on threadId and auth)
 */
export function useThreadAnalysesQuery(threadId: string, enabled?: boolean) {
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

  const query = useQuery({
    queryKey: queryKeys.threads.analyses(threadId),
    queryFn: async ({ queryKey }) => {
      // ✅ NAVIGATION RACE CONDITION FIX: Merge server data with existing cache
      // When navigating from overview → thread page:
      // 1. Overview creates pending analysis in cache (client-side, status='pending')
      // 2. Navigation happens immediately (analysis streaming but not persisted)
      // 3. Thread page query fetches from server (returns empty - analysis not persisted yet)
      // 4. Without merge, server's empty array would overwrite pending analysis
      // 5. Solution: Check cache BEFORE fetch, merge server data with cached pending analyses

      const { getQueryClient } = await import('@/lib/data/query-client');
      const queryClient = getQueryClient();

      // Get existing cache to check for pending/streaming analyses
      const cachedData = queryClient.getQueryData(queryKey) as {
        success: boolean;
        data: { items: Array<{ status: string; roundNumber: number; [key: string]: unknown }> };
      } | undefined;

      // Fetch from server
      const serverResponse = await getThreadAnalysesService({ param: { id: threadId } });

      // If no cached pending/streaming analyses, return server response as-is
      if (!cachedData?.success || cachedData.data.items.length === 0) {
        return serverResponse;
      }

      // Extract cached pending/streaming analyses that aren't on server yet
      const cachedPendingOrStreaming = cachedData.data.items.filter(
        item => item.status === AnalysisStatusSchema.enum.pending || item.status === AnalysisStatusSchema.enum.streaming,
      );

      if (cachedPendingOrStreaming.length === 0) {
        return serverResponse;
      }

      // ✅ MERGE STRATEGY: Prefer server data, keep cached pending/streaming for other rounds
      if (serverResponse.success) {
        // Build final merged list:
        // 1. Use server data for rounds that exist on server (completed/persisted analyses)
        // 2. Use cached pending/streaming for rounds not yet on server
        const mergedItems = [];
        const processedRounds = new Set<number>();

        // ✅ CRITICAL: Add all server analyses first (these are authoritative/completed)
        for (const serverItem of serverResponse.data.items) {
          const typedItem = serverItem as { roundNumber: number; status?: string; [key: string]: unknown };
          mergedItems.push(serverItem);
          processedRounds.add(typedItem.roundNumber);
        }

        // ✅ CRITICAL: Only add cached analyses for rounds that don't exist on server
        // This prevents duplicate entries and ensures server data takes precedence
        for (const cachedItem of cachedPendingOrStreaming) {
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
    staleTime: STALE_TIMES.threadAnalyses,
    // ✅ Keep placeholderData to prevent UI flicker during fetch
    placeholderData: previousData => previousData,
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!threadId),
    retry: false,
  });

  return query;
}
