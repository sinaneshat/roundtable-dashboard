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

'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import type { ChatAttachmentStatus } from '@/api/core/enums';
import { LIMITS } from '@/constants/limits';
import { useSession } from '@/lib/auth/client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import {
  getAttachmentService,
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
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

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
    getNextPageParam: lastPage => lastPage.success ? lastPage.data?.pagination?.nextCursor : undefined,
    enabled: isAuthenticated,
    staleTime: STALE_TIMES.threadDetail, // 10 seconds
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to fetch a specific upload by ID
 * Protected endpoint - requires authentication
 *
 * @param uploadId - Upload ID
 * @param enabled - Optional control over whether to fetch
 */
export function useUploadQuery(uploadId: string, enabled?: boolean) {
  const { data: session, isPending } = useSession();
  const isAuthenticated = !isPending && !!session?.user?.id;

  return useQuery({
    queryKey: queryKeys.uploads.detail(uploadId),
    queryFn: () => getAttachmentService({ param: { id: uploadId } }),
    staleTime: STALE_TIMES.threadDetail, // 10 seconds
    enabled: enabled !== undefined ? enabled : (isAuthenticated && !!uploadId),
    retry: false,
    throwOnError: false,
  });
}
