/**
 * Upload Query Hooks
 *
 * TanStack Query hooks for file upload operations
 * Following patterns from projects.ts and subscriptions.ts
 *
 * Architecture:
 * - Uploads are standalone entities owned by users
 * - Thread/message associations are via junction tables (threadUpload, messageUpload)
 * - Project associations are via projectAttachment table
 */

import type { ChatAttachmentStatus } from '@roundtable/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { LIMITS } from '@/constants';
import { useAuthCheck } from '@/hooks/utils';
import { queryKeys } from '@/lib/data/query-keys';
import { GC_TIMES, STALE_TIME_PRESETS, STALE_TIMES } from '@/lib/data/stale-times';
import {
  getDownloadUrlService,
  listAttachmentsService,
} from '@/services/api';

/**
 * Hook to fetch user's uploads with cursor-based infinite scrolling
 * Following TanStack Query v5 official patterns
 *
 * Note: For thread/message-specific uploads, use junction table APIs
 *
 * @param status - Optional status filter (uploading, uploaded, processing, ready, failed)
 */
export function useUploadsQuery(status?: ChatAttachmentStatus) {
  const { isAuthenticated } = useAuthCheck();

  return useInfiniteQuery({
    queryKey: [...queryKeys.uploads.lists(), status],
    queryFn: async ({ pageParam }) => {
      const limit = pageParam ? LIMITS.STANDARD_PAGE : LIMITS.INITIAL_PAGE;

      const query: { cursor?: string; status?: ChatAttachmentStatus; limit: number } = { limit };
      if (pageParam)
        query.cursor = pageParam;
      if (status)
        query.status = status;

      return listAttachmentsService({ query });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (!lastPage.success)
        return undefined;
      return lastPage.data.pagination.nextCursor;
    },
    enabled: isAuthenticated,
    staleTime: STALE_TIMES.threadDetail, // 10 seconds
    gcTime: GC_TIMES.STANDARD, // 5 minutes
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to fetch a signed download URL for an upload
 * Protected endpoint - requires authentication
 *
 * Used by message-attachment-preview when the original URL is invalid (blob/expired)
 * Returns a time-limited signed URL for downloading/previewing the file
 *
 * ✅ RATE LIMIT FIX: Use staleTime to prevent excessive refetches during streaming
 * Signed URLs are valid for 1 hour, so 2 minutes staleTime is safe and prevents
 * rate limit issues when components re-render frequently during streaming.
 *
 * @param uploadId - Upload ID
 * @param enabled - Control whether to fetch (based on need for fresh URL)
 */
export function useDownloadUrlQuery(uploadId: string, enabled: boolean) {
  const { isAuthenticated } = useAuthCheck();

  return useQuery({
    queryKey: queryKeys.uploads.downloadUrl(uploadId),
    queryFn: () => getDownloadUrlService({ param: { id: uploadId } }),
    // ✅ RATE LIMIT FIX: Cache for 2 minutes to prevent excessive refetches
    // Signed URLs are valid for 1 hour, so this is safe and prevents
    // rate limit issues when components re-render during streaming
    staleTime: STALE_TIME_PRESETS.medium, // 2 minutes - safe since URLs valid for 1 hour
    gcTime: GC_TIMES.STANDARD, // Keep in cache for 5 minutes
    enabled: enabled && isAuthenticated && !!uploadId,
    retry: 1, // Only retry once for URL fetch failures
    throwOnError: false,
  });
}
