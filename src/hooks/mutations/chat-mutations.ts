/**
 * Chat Mutation Hooks
 *
 * TanStack Mutation hooks for all chat operations
 * Following patterns from checkout.ts and subscription-management.ts
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { invalidationPatterns, queryKeys } from '@/lib/data/query-keys';
import {
  addParticipantService,
  createCustomRoleService,
  createPreSearchService,
  createThreadService,
  deleteCustomRoleService,
  deleteParticipantService,
  deleteThreadService,
  setRoundFeedbackService,
  updateCustomRoleService,
  updateParticipantService,
  updateThreadService,
} from '@/services/api';
import { validateThreadDetailCache, validateThreadDetailResponseCache, validateThreadsListPages } from '@/stores/chat/actions/types';

// ============================================================================
// Validation Schemas - Type-safe cache updates
// ============================================================================

/**
 * Schema for usage stats data structure
 * Validates optimistic cache updates for thread/message counts
 */
const UsageStatsDataSchema = z.object({
  messages: z.object({
    used: z.number(),
    limit: z.number(),
    remaining: z.number(),
    percentage: z.number(),
  }),
  threads: z.object({
    used: z.number(),
    limit: z.number(),
    remaining: z.number(),
    percentage: z.number(),
  }),
  subscription: z.unknown(),
  period: z.unknown(),
});

/**
 * Schema for API response wrapper
 * Validates the standard API response structure
 */
const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown(),
});

/**
 * Schema for thread data in cache
 * Validates thread object structure for optimistic updates
 */
const ThreadDataSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  mode: z.string().optional(),
  status: z.string().optional(),
  isFavorite: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  metadata: z.unknown().optional(),
});

/**
 * Schema for thread detail response data
 * Validates thread detail payload structure
 */
const ThreadDetailDataSchema = z.object({
  thread: z.unknown(),
  participants: z.array(z.unknown()).optional(),
  messages: z.array(z.unknown()).optional(),
  changelog: z.array(z.unknown()).optional(),
  user: z.unknown().optional(),
});

/**
 * Schema for paginated response pages
 * Validates infinite query page structure
 */
const PaginatedPageSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      items: z.array(ThreadDataSchema).optional(),
    })
    .optional(),
});

/**
 * Schema for infinite query data
 * Validates the complete infinite query structure
 */
const InfiniteQueryDataSchema = z.object({
  pages: z.array(PaginatedPageSchema),
  pageParams: z.array(z.unknown()).optional(),
});

// ============================================================================
// Type-safe cache update helpers
// ============================================================================

/**
 * Safely parse and validate unknown cache data
 * Returns null if data doesn't match expected schema
 *
 * ✅ RUNTIME ZOD VALIDATION: Ensures cache data integrity
 * - Validates API response structure
 * - Validates usage stats data shape
 * - Returns null on validation failure (safe fallback)
 *
 * ✅ DEFENSIVE HANDLING: Silently handles uninitialized queries
 */
function parseUsageStatsData(data: unknown) {
  // ✅ Handle uninitialized queries silently
  if (data === undefined || data === null) {
    return null;
  }

  const response = ApiResponseSchema.safeParse(data);
  if (!response.success || !response.data.success) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Invalid API response structure for usage stats:', response.error);
    }
    return null;
  }

  const usageData = UsageStatsDataSchema.safeParse(response.data.data);
  if (!usageData.success) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Invalid usage stats data structure:', usageData.error);
    }
    return null;
  }

  return usageData.data;
}

/**
 * Safely parse thread detail data from cache
 * Returns null if data doesn't match expected schema
 *
 * ✅ RUNTIME ZOD VALIDATION: Ensures thread detail cache integrity
 * - Validates API response wrapper
 * - Validates thread detail payload
 * - Returns null on validation failure (safe fallback)
 *
 * ✅ DEFENSIVE HANDLING: Silently handles uninitialized queries
 */
function parseThreadDetailData(data: unknown) {
  // ✅ Handle uninitialized queries silently
  if (data === undefined || data === null) {
    return null;
  }

  const response = ApiResponseSchema.safeParse(data);
  if (!response.success || !response.data.success) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Invalid API response structure for thread detail:', response.error);
    }
    return null;
  }

  const threadData = ThreadDetailDataSchema.safeParse(response.data.data);
  if (!threadData.success) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Invalid thread detail data structure:', threadData.error);
    }
    return null;
  }

  return threadData.data;
}

/**
 * Safely parse infinite query data from cache
 * Returns null if data doesn't match expected schema
 *
 * ✅ RUNTIME ZOD VALIDATION: Ensures infinite query cache integrity
 * - Validates infinite query structure (pages + pageParams)
 * - Validates each page's response structure
 * - Returns null on validation failure (safe fallback)
 *
 * ✅ DEFENSIVE HANDLING: Distinguishes between uninitialized and malformed data
 * - Silently handles undefined data (uninitialized queries are expected)
 * - Only logs errors for malformed data (actual data corruption)
 */
function parseInfiniteQueryData(data: unknown) {
  // ✅ CRITICAL FIX: Handle uninitialized queries silently
  // setQueriesData iterates over ALL matching queries, including uninitialized ones
  // This is expected behavior - don't pollute console with errors for undefined data
  if (data === undefined || data === null) {
    return null;
  }

  const queryData = InfiniteQueryDataSchema.safeParse(data);
  if (!queryData.success) {
    // Only log errors for actual data corruption (non-undefined invalid data)
    if (process.env.NODE_ENV === 'development') {
      console.error('Invalid infinite query data structure (malformed data, not uninitialized):', queryData.error);
    }
    return null;
  }

  return queryData.data;
}

// ============================================================================
// Thread Mutations
// ============================================================================

/**
 * Hook to create a new chat thread
 * Protected endpoint - requires authentication
 *
 * After successful creation, invalidates thread lists and usage stats
 */
export function useCreateThreadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createThreadService,
    // ✅ OPTIMISTIC UPDATE: Immediately increment thread count for instant UI feedback
    onMutate: async () => {
      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.usage.stats() });

      // Snapshot the previous value for rollback
      const previousUsage = queryClient.getQueryData(queryKeys.usage.stats());

      // Optimistically update thread count
      queryClient.setQueryData(
        queryKeys.usage.stats(),
        (oldData: unknown) => {
          const usageData = parseUsageStatsData(oldData);
          if (!usageData)
            return oldData;

          // ✅ OPTIMISTIC UPDATE: Only increment 'used' count
          // Backend will recompute remaining, percentage, and status on next fetch
          return {
            success: true,
            data: {
              ...usageData,
              threads: {
                ...usageData.threads,
                used: usageData.threads.used + 1,
                // Keep existing values - backend will provide correct values on refetch
                remaining: usageData.threads.remaining,
                percentage: usageData.threads.percentage,
              },
            },
          };
        },
      );

      // Return context with previous value for rollback
      return { previousUsage };
    },
    // On error, rollback to previous value
    onError: (_unusedError, _unusedVariables, context) => {
      if (context?.previousUsage) {
        queryClient.setQueryData(queryKeys.usage.stats(), context.previousUsage);
      }
    },
    onSuccess: () => {
      // ✅ ONE-WAY DATA FLOW: NO invalidation during active sessions
      // Client state already updated optimistically
      // Usage stats already updated optimistically in onMutate
      // Thread list will refresh naturally when user navigates or refreshes page

      // NO query invalidation - respects ONE-WAY data flow architecture
    },
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to update thread details
 * Protected endpoint - requires authentication
 *
 * ✅ ONE-WAY DATA FLOW: Uses optimistic updates for instant UI feedback
 * ChatThreadScreen manages its own state and doesn't need server refetches.
 */
export function useUpdateThreadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateThreadService,
    onMutate: async (variables) => {
      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.threads.detail(variables.param.id) });
      await queryClient.cancelQueries({ queryKey: queryKeys.threads.all });
      if ('slug' in variables.json && variables.json.slug) {
        await queryClient.cancelQueries({ queryKey: queryKeys.threads.bySlug(variables.json.slug as string) });
      }

      // Snapshot the previous values for rollback
      const previousThread = queryClient.getQueryData(queryKeys.threads.detail(variables.param.id));
      const previousThreads = queryClient.getQueryData(queryKeys.threads.all);
      const previousBySlug = ('slug' in variables.json && variables.json.slug)
        ? queryClient.getQueryData(queryKeys.threads.bySlug(variables.json.slug as string))
        : null;

      // Optimistically update thread detail query
      queryClient.setQueryData(
        queryKeys.threads.detail(variables.param.id),
        (old: unknown) => {
          const parsedData = parseThreadDetailData(old);
          if (!parsedData)
            return old;

          // Validate update payload before merging
          const updatePayload = ThreadDataSchema.partial().safeParse(variables.json);
          if (!updatePayload.success)
            return old;

          return {
            success: true,
            data: {
              ...parsedData,
              thread: {
                ...(parsedData.thread as object),
                ...updatePayload.data,
              },
            },
          };
        },
      );

      // ✅ CRITICAL FIX: Only update infinite queries (lists), not detail/analyses/etc queries
      // Using queryKeys.threads.all matches ALL queries starting with ['threads']
      // This includes detail queries, analyses, changelog, etc. that don't have pages array
      // Use predicate to check if query key matches infinite query pattern
      queryClient.setQueriesData(
        {
          queryKey: queryKeys.threads.all,
          predicate: (query) => {
            // Only update queries that are infinite queries (have 'list' in the key)
            // ['threads', 'list'] or ['threads', 'list', 'search', 'term']
            const key = query.queryKey as string[];
            return key.length >= 2 && key[1] === 'list';
          },
        },
        (old: unknown) => {
          const parsedQuery = parseInfiniteQueryData(old);
          if (!parsedQuery)
            return old;

          // Validate update payload
          const updatePayload = ThreadDataSchema.partial().safeParse(variables.json);
          if (!updatePayload.success)
            return old;

          return {
            ...parsedQuery,
            pages: parsedQuery.pages.map((page) => {
              if (!page.success || !page.data?.items)
                return page;

              return {
                ...page,
                data: {
                  ...page.data,
                  items: page.data.items.map((thread) => {
                    // Validate thread data before updating
                    const threadData = ThreadDataSchema.safeParse(thread);
                    if (!threadData.success)
                      return thread;

                    return threadData.data.id === variables.param.id
                      ? { ...threadData.data, ...updatePayload.data }
                      : thread;
                  }),
                },
              };
            }),
          };
        },
      );

      // Optimistically update bySlug query if slug is provided
      if ('slug' in variables.json && variables.json.slug) {
        const slug = variables.json.slug;
        if (typeof slug === 'string') {
          queryClient.setQueryData(
            queryKeys.threads.bySlug(slug),
            (old: unknown) => {
              const parsedData = parseThreadDetailData(old);
              if (!parsedData)
                return old;

              // Validate update payload
              const updatePayload = ThreadDataSchema.partial().safeParse(variables.json);
              if (!updatePayload.success)
                return old;

              return {
                success: true,
                data: {
                  ...parsedData,
                  thread: {
                    ...(parsedData.thread as object),
                    ...updatePayload.data,
                  },
                },
              };
            },
          );
        }
      }

      // Return context with previous values for rollback
      return { previousThread, previousThreads, previousBySlug, slug: 'slug' in variables.json ? variables.json.slug as string : null };
    },
    onError: (_unusedError, variables, context) => {
      // Rollback on error
      if (context?.previousThread) {
        queryClient.setQueryData(queryKeys.threads.detail(variables.param.id), context.previousThread);
      }
      if (context?.previousThreads) {
        queryClient.setQueryData(queryKeys.threads.all, context.previousThreads);
      }
      if (context?.slug && context?.previousBySlug) {
        queryClient.setQueryData(queryKeys.threads.bySlug(context.slug), context.previousBySlug);
      }
    },
    onSuccess: async (_data, variables) => {
      // ✅ CRITICAL FIX: Invalidate changelog when participants/mode changes
      // The backend creates changelog entries, so we need to refetch to show them
      // Only invalidate if participants or mode was updated
      if ('participants' in variables.json || 'mode' in variables.json) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.threads.changelog(variables.param.id),
        });
      }
    },
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to delete a thread
 * Protected endpoint - requires authentication
 *
 * Uses optimistic cache removal instead of invalidation
 * Respects ONE-WAY data flow pattern
 */
export function useDeleteThreadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteThreadService,
    onMutate: async (variables) => {
      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.threads.all });
      await queryClient.cancelQueries({ queryKey: queryKeys.usage.stats() });

      // Snapshot the previous values for rollback
      const previousThreads = queryClient.getQueryData(queryKeys.threads.all);
      const previousUsage = queryClient.getQueryData(queryKeys.usage.stats());

      // ✅ CRITICAL FIX: Only update infinite queries (lists), not detail/analyses/etc queries
      // Using queryKeys.threads.all matches ALL queries starting with ['threads']
      // This includes detail queries, analyses, changelog, etc. that don't have pages array
      // Use predicate to check if query key matches infinite query pattern
      queryClient.setQueriesData(
        {
          queryKey: queryKeys.threads.all,
          predicate: (query) => {
            // Only update queries that are infinite queries (have 'list' in the key)
            // ['threads', 'list'] or ['threads', 'list', 'search', 'term']
            const key = query.queryKey as string[];
            return key.length >= 2 && key[1] === 'list';
          },
        },
        (old: unknown) => {
          const parsedQuery = parseInfiniteQueryData(old);
          if (!parsedQuery)
            return old;

          return {
            ...parsedQuery,
            pages: parsedQuery.pages.map((page) => {
              if (!page.success || !page.data?.items)
                return page;

              return {
                ...page,
                data: {
                  ...page.data,
                  items: page.data.items.filter((thread) => {
                    const threadData = ThreadDataSchema.safeParse(thread);
                    return threadData.success && threadData.data.id !== variables.param.id;
                  }),
                },
              };
            }),
          };
        },
      );

      // Optimistically update usage stats - decrement thread count
      queryClient.setQueryData(
        queryKeys.usage.stats(),
        (oldData: unknown) => {
          const usageData = parseUsageStatsData(oldData);
          if (!usageData)
            return oldData;

          return {
            success: true,
            data: {
              ...usageData,
              threads: {
                ...usageData.threads,
                used: Math.max(0, usageData.threads.used - 1), // Prevent negative
                remaining: usageData.threads.remaining + 1,
                // Recalculate percentage
                percentage:
                  usageData.threads.limit > 0
                    ? Math.round(((usageData.threads.used - 1) / usageData.threads.limit) * 100)
                    : 0,
              },
            },
          };
        },
      );

      // Return context with previous values for rollback
      return { previousThreads, previousUsage };
    },
    onError: (_unusedError, _unusedVariables, context) => {
      // Rollback on error
      if (context?.previousThreads) {
        queryClient.setQueryData(queryKeys.threads.all, context.previousThreads);
      }
      if (context?.previousUsage) {
        queryClient.setQueryData(queryKeys.usage.stats(), context.previousUsage);
      }
    },
    onSuccess: () => {
      // ✅ ONE-WAY DATA FLOW: NO invalidation
      // Cache already updated optimistically
      // Changes persist across navigation
    },
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to toggle thread favorite status
 * Protected endpoint - requires authentication
 *
 * Uses optimistic updates for instant UI feedback
 * Rolls back on error
 */
export function useToggleFavoriteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ threadId, isFavorite }: { threadId: string; isFavorite: boolean; slug?: string }) =>
      updateThreadService({ param: { id: threadId }, json: { isFavorite } }),
    // Optimistic update: Update UI immediately before server response
    onMutate: async (variables) => {
      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.threads.all });
      if (variables.slug) {
        await queryClient.cancelQueries({ queryKey: queryKeys.threads.bySlug(variables.slug) });
      }

      // Snapshot the previous values for rollback
      const previousThreads = queryClient.getQueryData(queryKeys.threads.all);
      const previousBySlug = variables.slug
        ? queryClient.getQueryData(queryKeys.threads.bySlug(variables.slug))
        : null;

      // Optimistically update all thread list queries
      queryClient.setQueriesData(
        { queryKey: queryKeys.threads.all },
        (old: unknown) => {
          if (!old || typeof old !== 'object')
            return old;
          if (!('pages' in old))
            return old;
          const pages = validateThreadsListPages(old.pages);
          if (!pages)
            return old;

          return {
            ...old,
            pages: pages.map((page) => {
              if (!page.success || !page.data?.items)
                return page;

              return {
                ...page,
                data: {
                  ...page.data,
                  items: page.data.items.map(thread =>
                    thread.id === variables.threadId
                      ? { ...thread, isFavorite: variables.isFavorite }
                      : thread,
                  ),
                },
              };
            }),
          };
        },
      );

      // Optimistically update bySlug query if slug is provided
      if (variables.slug) {
        queryClient.setQueryData(
          queryKeys.threads.bySlug(variables.slug),
          (old: unknown) => {
            const parsedData = parseThreadDetailData(old);
            if (!parsedData)
              return old;

            return {
              success: true,
              data: {
                ...parsedData,
                thread: {
                  ...(parsedData.thread as object),
                  isFavorite: variables.isFavorite,
                },
              },
            };
          },
        );
      }

      // Return context with previous values for rollback
      return { previousThreads, previousBySlug, slug: variables.slug };
    },
    // On error, rollback to previous values
    onError: (_unusedError, _unusedVariables, context) => {
      if (context?.previousThreads) {
        queryClient.setQueryData(queryKeys.threads.all, context.previousThreads);
      }
      if (context?.slug && context?.previousBySlug) {
        queryClient.setQueryData(queryKeys.threads.bySlug(context.slug), context.previousBySlug);
      }
    },
    // ✅ NO invalidation - optimistic updates handle UI
    // Invalidation would trigger GET requests during active chat, breaking streaming state
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to toggle thread public/private status
 * Protected endpoint - requires authentication
 *
 * Uses optimistic updates for instant UI feedback
 * Rolls back on error
 * Triggers ISR revalidation for public pages
 */
export function useTogglePublicMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ threadId, isPublic }: { threadId: string; isPublic: boolean; slug?: string }) =>
      updateThreadService({ param: { id: threadId }, json: { isPublic } }),
    // Optimistic update: Update UI immediately before server response
    onMutate: async (variables) => {
      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.threads.all });
      if (variables.slug) {
        await queryClient.cancelQueries({ queryKey: queryKeys.threads.bySlug(variables.slug) });
      }

      // Snapshot the previous values for rollback
      const previousThreads = queryClient.getQueryData(queryKeys.threads.all);
      const previousBySlug = variables.slug
        ? queryClient.getQueryData(queryKeys.threads.bySlug(variables.slug))
        : null;

      // Optimistically update all thread list queries
      queryClient.setQueriesData(
        { queryKey: queryKeys.threads.all },
        (old: unknown) => {
          if (!old || typeof old !== 'object')
            return old;
          if (!('pages' in old))
            return old;
          const pages = validateThreadsListPages(old.pages);
          if (!pages)
            return old;

          return {
            ...old,
            pages: pages.map((page) => {
              if (!page.success || !page.data?.items)
                return page;

              return {
                ...page,
                data: {
                  ...page.data,
                  items: page.data.items.map(thread =>
                    thread.id === variables.threadId
                      ? { ...thread, isPublic: variables.isPublic }
                      : thread,
                  ),
                },
              };
            }),
          };
        },
      );

      // Optimistically update bySlug query if slug is provided
      if (variables.slug) {
        queryClient.setQueryData(
          queryKeys.threads.bySlug(variables.slug),
          (old: unknown) => {
            const parsedData = parseThreadDetailData(old);
            if (!parsedData)
              return old;

            return {
              success: true,
              data: {
                ...parsedData,
                thread: {
                  ...(parsedData.thread as object),
                  isPublic: variables.isPublic,
                },
              },
            };
          },
        );
      }

      // Return context with previous values for rollback
      return { previousThreads, previousBySlug, slug: variables.slug };
    },
    // On error, rollback to previous values
    onError: (_unusedError, _unusedVariables, context) => {
      if (context?.previousThreads) {
        queryClient.setQueryData(queryKeys.threads.all, context.previousThreads);
      }
      if (context?.slug && context?.previousBySlug) {
        queryClient.setQueryData(queryKeys.threads.bySlug(context.slug), context.previousBySlug);
      }
    },
    // On success, invalidate queries
    onSuccess: async (_data, _variables) => {
      // ✅ NO invalidation except for public page cache
      // Public pages will be regenerated on next request via ISR
      // Server Action revalidation removed to fix HMR bundling issues
    },
    retry: false,
    throwOnError: false,
  });
}

// ============================================================================
// Message Mutations
// ============================================================================
// NOTE: useSendMessageMutation removed - use AI SDK v5 useChat hook for all message operations
// All messages are now streamed via streamChatService for better UX
// Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot

// ============================================================================
// Participant Mutations
// ============================================================================

/**
 * Hook to add a participant to a thread
 * Protected endpoint - requires authentication
 *
 * Uses optimistic updates for instant UI feedback
 */
export function useAddParticipantMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: addParticipantService,
    onMutate: async (variables) => {
      const threadId = variables.param.id;

      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.threads.detail(threadId) });

      // Snapshot the previous value for rollback
      const previousThread = queryClient.getQueryData(queryKeys.threads.detail(threadId));

      // Optimistically add participant to thread detail query
      queryClient.setQueryData(
        queryKeys.threads.detail(threadId),
        (old: unknown) => {
          if (!old || typeof old !== 'object')
            return old;
          if (!('success' in old) || !old.success)
            return old;
          if (!('data' in old) || !old.data || typeof old.data !== 'object')
            return old;

          const data = validateThreadDetailCache(old.data);
          if (!data)
            return old;

          // Create optimistic participant with temporary ID
          const participantData = variables.json as {
            modelId: unknown;
            role?: string | null;
            customRoleId?: string | null;
            priority: unknown;
            isEnabled?: boolean;
          };
          const optimisticParticipant = {
            id: `temp-${Date.now()}`, // Temporary ID until server responds
            threadId,
            modelId: participantData.modelId,
            role: participantData.role,
            customRoleId: participantData.customRoleId ?? null,
            priority: participantData.priority,
            isEnabled: participantData.isEnabled ?? true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          return {
            ...old,
            data: {
              ...data,
              participants: [...data.participants, optimisticParticipant],
            },
          };
        },
      );

      // Return context with previous value for rollback
      return { previousThread, threadId };
    },
    onError: (_unusedError, _unusedVariables, context) => {
      // Rollback on error
      if (context?.previousThread && context?.threadId) {
        queryClient.setQueryData(queryKeys.threads.detail(context.threadId), context.previousThread);
      }
    },
    onSuccess: (data, variables) => {
      const threadId = variables.param.id;

      // Update cache with real participant ID from server response
      queryClient.setQueryData(
        queryKeys.threads.detail(threadId),
        (old: unknown) => {
          // ✅ TYPE-SAFE: Use Zod validation instead of manual type guards
          const cache = validateThreadDetailResponseCache(old);
          if (!cache)
            return old;

          // Replace temporary participant with real server data
          return {
            ...cache,
            data: {
              ...cache.data,
              participants: cache.data.participants.map(p =>
                p.id.startsWith('temp-')
                  ? (data.success && data.data ? data.data : p)
                  : p,
              ),
            },
          };
        },
      );

      // ✅ ONE-WAY DATA FLOW: NO invalidation
      // ChatThreadScreen uses optimistically updated cache as source of truth
    },
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to update participant settings
 * Protected endpoint - requires authentication
 *
 * Uses optimistic updates for instant UI feedback
 */
export function useUpdateParticipantMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Parameters<typeof updateParticipantService>[0] & { threadId?: string }) =>
      updateParticipantService(data),
    onMutate: async (variables) => {
      // Extract threadId from variables (passed as extra param)
      const threadId = variables.threadId;
      if (!threadId) {
        // If no threadId provided, skip optimistic update
        return { previousThread: null, threadId: null };
      }

      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.threads.detail(threadId) });

      // Snapshot the previous value for rollback
      const previousThread = queryClient.getQueryData(queryKeys.threads.detail(threadId));

      // Optimistically update participant in thread detail query
      queryClient.setQueryData(
        queryKeys.threads.detail(threadId),
        (old: unknown) => {
          if (!old || typeof old !== 'object')
            return old;
          if (!('success' in old) || !old.success)
            return old;
          if (!('data' in old) || !old.data || typeof old.data !== 'object')
            return old;

          const data = validateThreadDetailCache(old.data);
          if (!data)
            return old;

          return {
            ...old,
            data: {
              ...data,
              participants: data.participants.map(p =>
                p.id === variables.param.id
                  ? { ...p, ...variables.json, updatedAt: new Date().toISOString() }
                  : p,
              ),
            },
          };
        },
      );

      // Return context with previous value for rollback
      return { previousThread, threadId };
    },
    onError: (_unusedError, _unusedVariables, context) => {
      // Rollback on error
      if (context?.previousThread && context?.threadId) {
        queryClient.setQueryData(queryKeys.threads.detail(context.threadId), context.previousThread);
      }
    },
    onSuccess: () => {
      // ✅ ONE-WAY DATA FLOW: NO invalidation
      // ChatThreadScreen uses optimistically updated cache as source of truth
    },
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to delete a participant from a thread
 * Protected endpoint - requires authentication
 *
 * Uses optimistic updates for instant UI feedback
 */
export function useDeleteParticipantMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Parameters<typeof deleteParticipantService>[0] & { threadId?: string }) =>
      deleteParticipantService(data),
    onMutate: async (variables) => {
      // Extract threadId from variables (passed as extra param)
      const threadId = variables.threadId;
      if (!threadId) {
        // If no threadId provided, skip optimistic update
        return { previousThread: null, threadId: null };
      }

      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.threads.detail(threadId) });

      // Snapshot the previous value for rollback
      const previousThread = queryClient.getQueryData(queryKeys.threads.detail(threadId));

      // Optimistically remove participant from thread detail query
      queryClient.setQueryData(
        queryKeys.threads.detail(threadId),
        (old: unknown) => {
          if (!old || typeof old !== 'object')
            return old;
          if (!('success' in old) || !old.success)
            return old;
          if (!('data' in old) || !old.data || typeof old.data !== 'object')
            return old;

          const data = validateThreadDetailCache(old.data);
          if (!data)
            return old;

          return {
            ...old,
            data: {
              ...data,
              participants: data.participants.filter(p =>
                p.id !== variables.param.id,
              ),
            },
          };
        },
      );

      // Return context with previous value for rollback
      return { previousThread, threadId };
    },
    onError: (_unusedError, _unusedVariables, context) => {
      // Rollback on error
      if (context?.previousThread && context?.threadId) {
        queryClient.setQueryData(queryKeys.threads.detail(context.threadId), context.previousThread);
      }
    },
    onSuccess: () => {
      // ✅ ONE-WAY DATA FLOW: NO invalidation
      // ChatThreadScreen uses optimistically updated cache as source of truth
    },
    retry: false,
    throwOnError: false,
  });
}

// ============================================================================
// Custom Role Mutations
// ============================================================================

/**
 * Hook to create a new custom role
 * Protected endpoint - requires authentication
 *
 * After successful creation, invalidates custom role lists and usage stats
 */
export function useCreateCustomRoleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCustomRoleService,
    onSuccess: () => {
      // Invalidate custom role lists and usage stats
      invalidationPatterns.customRoles.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    onError: () => {
      // Error is handled by throwOnError: false
    },
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to update custom role details
 * Protected endpoint - requires authentication
 *
 * After successful update, invalidates specific role and lists
 */
export function useUpdateCustomRoleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateCustomRoleService,
    onSuccess: (_data, data) => {
      // Invalidate specific role and lists
      queryClient.invalidateQueries({ queryKey: queryKeys.customRoles.detail(data.param.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.customRoles.lists() });
    },
    onError: () => {
      // Error is handled by throwOnError: false
    },
    retry: false,
    throwOnError: false,
  });
}

/**
 * Hook to delete a custom role
 * Protected endpoint - requires authentication
 *
 * After successful deletion, invalidates custom role lists and usage stats
 */
export function useDeleteCustomRoleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCustomRoleService,
    onSuccess: () => {
      // Invalidate custom role lists and usage stats
      invalidationPatterns.customRoles.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    },
    onError: () => {
      // Error is handled by throwOnError: false
    },
    retry: false,
    throwOnError: false,
  });
}

// ============================================================================
// Analysis Mutations
// ============================================================================

/**
 * ❌ REMOVED: useTriggerAnalysisMutation
 *
 * Analysis is now handled via:
 * 1. Auto-detection on backend (streamChatHandler onFinish callback)
 * 2. On-demand streaming via useObject hook from @ai-sdk/react
 *
 * No manual mutation needed - analysis streams automatically when component renders
 * Reference: See src/components/chat/round-analysis-stream.tsx for usage
 */

// ============================================================================
// Round Feedback Mutations
// ============================================================================

/**
 * Hook to set round feedback (like/dislike)
 * Protected endpoint - requires authentication
 *
 * ✅ CRITICAL FIX: Invalidate feedback query on success
 * Ensures page refresh loads latest feedback from server
 */
export function useSetRoundFeedbackMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: setRoundFeedbackService,
    onSuccess: (_data, variables) => {
      // ✅ CRITICAL FIX: Invalidate feedback query so page refresh loads latest data
      // Client state already optimistically updated, but we need server to be source of truth on refresh
      queryClient.invalidateQueries({
        queryKey: queryKeys.threads.feedback(variables.param.threadId),
      });
    },
    onError: () => {
      // Error is handled by throwOnError: false
      // Client state remains unchanged (optimistic update not rolled back)
    },
    retry: false,
    throwOnError: false,
  });
}

// ============================================================================
// Pre-Search Creation - Web Search Ordering Fix
// ============================================================================

/**
 * Create PENDING pre-search record hook
 *
 * ✅ NEW: Fixes web search ordering bug
 * ✅ PURPOSE: Creates pre-search record BEFORE participants start streaming
 *
 * **CRITICAL FIX FOR WEB SEARCH ORDERING**:
 *
 * OLD FLOW (Broken):
 *   User message → Participant streaming → Pre-search created during streaming
 *
 * NEW FLOW (Fixed):
 *   User message → Create PENDING pre-search → Execute search → Participants start
 *
 * **USAGE**:
 * ```tsx
 * const createPreSearch = useCreatePreSearchMutation();
 *
 * // Before sending message, create pre-search
 * await createPreSearch.mutateAsync({
 *   param: {
 *     threadId: 'thread-1',
 *     roundNumber: '1',
 *   },
 *   json: {
 *     userQuery: 'What is Bitcoin price?',
 *   },
 * });
 *
 * // Wait for pre-search to complete
 * // Then call sendMessage() to start participants
 * ```
 *
 * **FLOW**:
 * 1. User sends message with web search enabled
 * 2. Frontend calls this hook → Creates PENDING record
 * 3. PreSearchOrchestrator syncs record to store
 * 4. PreSearchStream detects PENDING → Executes search (STREAMING)
 * 5. Search completes (COMPLETE)
 * 6. Frontend detects COMPLETE → Calls sendMessage() → Participants start
 *
 * **REFERENCE**: WEB_SEARCH_ORDERING_FIX_STRATEGY.md
 */
export function useCreatePreSearchMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createPreSearchService,
    onSuccess: (_data, variables) => {
      // ✅ INVALIDATE: Trigger orchestrator to sync new pre-search
      queryClient.invalidateQueries({
        queryKey: queryKeys.threads.preSearches(variables.param.threadId),
      });
    },
    retry: false,
    throwOnError: true, // Throw errors since pre-search is critical for correct flow
  });
}
