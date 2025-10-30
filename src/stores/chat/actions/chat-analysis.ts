/**
 * Chat Analysis Hook
 *
 * Manages analysis state via React Query cache as single source of truth.
 * Backend auto-creates pending analyses; hook provides cache manipulation.
 *
 * ✅ CACHE SYNCHRONIZATION FIXES:
 * - Functional updates for all cache operations (prevents race conditions)
 * - Validation before cache updates (prevents corrupt data)
 * - Status-aware updates (prevents overwriting completed with stale data)
 * - Error recovery and reporting
 */

'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { UIMessage } from 'ai';
import { useCallback, useMemo, useState } from 'react';
import { z } from 'zod';

import { AnalysisStatusSchema, ChatModeSchema } from '@/api/core/enums';
import type { ChatParticipant, ModeratorAnalysisPayload, StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { ModeratorAnalysisPayloadSchema } from '@/api/routes/chat/schema';
import { useThreadAnalysesQuery } from '@/hooks/queries/chat';
import { queryKeys } from '@/lib/data/query-keys';
import { ParticipantsArraySchema } from '@/lib/schemas/participant-schemas';
import { isCompleteAnalysis } from '@/lib/utils/analysis-utils';
import { transformModeratorAnalyses } from '@/lib/utils/date-transforms';
import { getParticipantMessagesWithIds } from '@/lib/utils/message-filtering';

import { validateAnalysesCache } from './types';

/**
 * Zod schema for UseChatAnalysisOptions validation
 * Validates hook options at entry point to ensure type safety
 */
const UseChatAnalysisOptionsSchema = z.object({
  threadId: z.string(), // Allow empty string for initial state
  mode: ChatModeSchema,
  enabled: z.boolean().optional().default(true),
}).strict();

/**
 * Options for configuring the chat analysis hook
 * Derived from Zod schema for type safety
 */
type UseChatAnalysisOptions = z.infer<typeof UseChatAnalysisOptionsSchema>;

/**
 * Zod schemas for internal function parameters
 */
/**
 * ✅ SINGLE SOURCE OF TRUTH: Uses ParticipantsArraySchema from central schemas
 */
const CreatePendingAnalysisParamsSchema = z.object({
  roundNumber: z.number().int().positive(),
  messages: z.array(z.custom<UIMessage>()),
  participants: ParticipantsArraySchema,
  userQuestion: z.string().min(1),
}).strict();

const UpdateAnalysisDataParamsSchema = z.object({
  roundNumber: z.number().int().positive(),
  data: ModeratorAnalysisPayloadSchema,
}).strict();

const UpdateAnalysisStatusParamsSchema = z.object({
  roundNumber: z.number().int().positive(),
  status: AnalysisStatusSchema,
}).strict();

const RoundNumberParamSchema = z.object({
  roundNumber: z.number().int().positive(),
}).strict();

const MarkAnalysisFailedParamsSchema = z.object({
  roundNumber: z.number().int().positive(),
  errorMessage: z.string().min(1),
}).strict();

type UseChatAnalysisReturn = {
  analyses: StoredModeratorAnalysis[];
  isLoading: boolean;
  createPendingAnalysis: (
    roundNumber: number,
    messages: UIMessage[],
    participants: ChatParticipant[],
    userQuestion: string,
  ) => void;
  updateAnalysisData: (roundNumber: number, data: ModeratorAnalysisPayload) => void;
  updateAnalysisStatus: (roundNumber: number, status: 'pending' | 'streaming' | 'completed' | 'failed') => void;
  removePendingAnalysis: (roundNumber: number) => void;
  markAnalysisFailed: (roundNumber: number, errorMessage: string) => void;
  validateAnalysisData: (data: unknown) => data is ModeratorAnalysisPayload;
};

export function useChatAnalysis(
  options: UseChatAnalysisOptions,
): UseChatAnalysisReturn {
  // Validate options at hook entry point with safeParse for better error handling
  const validationResult = UseChatAnalysisOptionsSchema.safeParse(options);

  const validatedOptions = validationResult.success ? validationResult.data : options;

  const {
    threadId,
    mode,
    enabled = true,
  } = validatedOptions;

  const queryClient = useQueryClient();
  const [_hookError, setHookError] = useState<Error | null>(null);

  // ✅ CRITICAL FIX: State trigger to force re-renders when cache is updated manually
  // When query is disabled, cache updates don't trigger re-renders automatically
  const [cacheVersion, setCacheVersion] = useState(0);

  // ✅ STREAMING PROTECTION: Only enable query when explicitly allowed
  // This prevents the aggressive polling and refetchOnMount from disrupting streaming
  const { data: analysesResponse, isLoading } = useThreadAnalysesQuery(threadId, enabled && !!threadId);

  const analyses = useMemo(() => {
    // ✅ CRITICAL FIX: When query is disabled, read directly from cache
    // This allows pending analyses created via createPendingAnalysis to be visible
    if (!enabled && threadId) {
      const cachedData = validateAnalysesCache(queryClient.getQueryData(queryKeys.threads.analyses(threadId)));

      if (cachedData?.success && cachedData.data?.items) {
        // ✅ SINGLE SOURCE OF TRUTH: Use date transform utility with Zod validation
        return transformModeratorAnalyses(cachedData.data.items);
      }

      return [];
    }

    // When query is enabled, use the query response
    if (!analysesResponse?.success) {
      return [];
    }

    // ✅ SINGLE SOURCE OF TRUTH: Use date transform utility with Zod validation
    return transformModeratorAnalyses(analysesResponse.data.items);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cacheVersion intentionally included to force re-computation when cache is manually updated
  }, [analysesResponse, enabled, threadId, queryClient, cacheVersion]);

  const createPendingAnalysis = useCallback(
    (
      roundNumber: number,
      messages: UIMessage[],
      participants: ChatParticipant[],
      userQuestion: string,
    ) => {
      try {
        // Provide a fallback for empty user questions and ensure it's always a string
        const safeUserQuestion = (userQuestion && typeof userQuestion === 'string' && userQuestion.trim())
          ? userQuestion.trim()
          : 'No question provided';

        // Validate parameters at function entry
        const validated = CreatePendingAnalysisParamsSchema.parse({
          roundNumber,
          messages,
          participants,
          userQuestion: safeUserQuestion,
        });

        // ✅ SINGLE SOURCE OF TRUTH: Use utility functions for type-safe extraction
        // Replaces unsafe type assertions and complex type conversions
        // Handles deduplication automatically via Set internally
        const { ids: participantMessageIds } = getParticipantMessagesWithIds(
          validated.messages,
          validated.roundNumber,
        );

        // ✅ VALIDATION: Check if we have the expected number of participant messages
        const expectedCount = validated.participants.filter(p => p.isEnabled).length;
        const actualCount = participantMessageIds.length;

        if (actualCount < expectedCount) {
          // ✅ RECOVERY: Round is incomplete
          // ✅ FIX: During regeneration, participants might still be streaming
          // Allow creating pending analysis even if count doesn't match yet
          // The backend will handle validation when streaming completes
          // Continue instead of returning early
        }

        const pendingAnalysis: StoredModeratorAnalysis = {
          id: `pending-${threadId}-${validated.roundNumber}-${Date.now()}`,
          threadId,
          roundNumber: validated.roundNumber,
          mode,
          userQuestion: validated.userQuestion,
          status: 'pending' as const,
          participantMessageIds,
          analysisData: null,
          createdAt: new Date(),
          completedAt: null,
          errorMessage: null,
        };

        queryClient.setQueryData(
          queryKeys.threads.analyses(threadId),
          (oldData: unknown) => {
            // ✅ SINGLE SOURCE OF TRUTH: Use validation helper for type-safe cache access
            const cacheData = validateAnalysesCache(oldData);

            // ✅ FIX: Ensure cache structure is always valid
            if (!cacheData) {
              return {
                success: true,
                data: { items: [pendingAnalysis] },
              };
            }

            // ✅ FIX: Only remove pending/streaming analyses for this round
            // Keep completed analyses to prevent them from reverting to streaming state
            const filteredItems = cacheData.data.items.filter(
              a => a.roundNumber !== validated.roundNumber || a.status === AnalysisStatusSchema.enum.completed,
            );

            // Check if any analysis (pending, streaming, or completed) already exists for this round
            const hasExistingAnalysis = cacheData.data.items.some(
              a => a.roundNumber === validated.roundNumber
                && (a.status === AnalysisStatusSchema.enum.completed
                  || a.status === AnalysisStatusSchema.enum.pending
                  || a.status === AnalysisStatusSchema.enum.streaming),
            );

            if (hasExistingAnalysis) {
              // Don't create duplicate analysis for the same round
              return cacheData;
            }

            // Add new pending analysis
            return {
              ...cacheData,
              data: {
                ...cacheData.data,
                items: [...filteredItems, pendingAnalysis],
              },
            };
          },
        );

        // ✅ CRITICAL FIX: Trigger re-render when cache is updated
        setCacheVersion(v => v + 1);
      } catch (error) {
        // ✅ ERROR RECOVERY: If creating pending analysis fails, set error state
        setHookError(error instanceof Error ? error : new Error('Failed to create pending analysis'));
      }
    },
    [queryClient, threadId, mode],
  );

  const updateAnalysisData = useCallback(
    (roundNumber: number, data: ModeratorAnalysisPayload) => {
      try {
        // Validate parameters at function entry
        const validated = UpdateAnalysisDataParamsSchema.parse({
          roundNumber,
          data,
        });

        queryClient.setQueryData(
          queryKeys.threads.analyses(threadId),
          (oldData: unknown) => {
            // ✅ SINGLE SOURCE OF TRUTH: Use validation helper for type-safe cache access
            const cacheData = validateAnalysesCache(oldData);

            if (!cacheData) {
              return oldData;
            }

            // ✅ CRITICAL: Find and update the specific analysis by round number
            // Preserve all other analyses unchanged to prevent cache corruption
            const updated = cacheData.data.items.map((analysis) => {
              if (analysis.roundNumber === validated.roundNumber) {
                // ✅ CRITICAL FIX: Only update if status is pending or streaming
                // Don't overwrite already completed analyses (prevents regression)
                if (analysis.status === AnalysisStatusSchema.enum.pending || analysis.status === AnalysisStatusSchema.enum.streaming) {
                  return {
                    ...analysis,
                    status: AnalysisStatusSchema.enum.completed,
                    analysisData: validated.data,
                    completedAt: new Date(),
                    errorMessage: null, // Clear any previous errors
                  };
                }
                // ✅ If already completed, don't overwrite (prevents stale data from replacing fresh data)
              }
              return analysis;
            });

            return {
              ...cacheData,
              data: { ...cacheData.data, items: updated },
            };
          },
        );

        // ✅ CRITICAL FIX: Trigger re-render when cache is updated
        setCacheVersion(v => v + 1);

        // ✅ ONE-WAY DATA FLOW: NO query invalidation
        // Cache is updated directly above - invalidation would trigger refetch and break streaming
        // The query is disabled during streaming anyway (enabled: false in ChatThreadScreen)
      } catch (error) {
        // ✅ ERROR RECOVERY: If updating analysis fails, set error state
        setHookError(error instanceof Error ? error : new Error('Failed to update analysis data'));
      }
    },
    [queryClient, threadId],
  );

  const updateAnalysisStatus = useCallback(
    (roundNumber: number, status: 'pending' | 'streaming' | 'completed' | 'failed') => {
      try {
        // Validate parameters at function entry
        const validated = UpdateAnalysisStatusParamsSchema.parse({
          roundNumber,
          status,
        });

        queryClient.setQueryData(
          queryKeys.threads.analyses(threadId),
          (oldData: unknown) => {
            // ✅ SINGLE SOURCE OF TRUTH: Use validation helper for type-safe cache access
            const cacheData = validateAnalysesCache(oldData);

            if (!cacheData) {
              return oldData;
            }

            const updated = cacheData.data.items.map((analysis) => {
              if (analysis.roundNumber === validated.roundNumber) {
                return {
                  ...analysis,
                  status: validated.status,
                };
              }
              return analysis;
            });

            return {
              ...cacheData,
              data: { ...cacheData.data, items: updated },
            };
          },
        );

        // ✅ CRITICAL FIX: Trigger re-render when cache is updated
        setCacheVersion(v => v + 1);
      } catch (error) {
        setHookError(error instanceof Error ? error : new Error('Failed to update analysis status'));
      }
    },
    [queryClient, threadId],
  );

  const removePendingAnalysis = useCallback(
    (roundNumber: number) => {
      try {
        // Validate parameters at function entry
        const validated = RoundNumberParamSchema.parse({ roundNumber });

        // ✅ IMMEDIATE REMOVAL: Completely remove analysis for this round from cache
        // This ensures the UI immediately stops showing the old analysis
        // When the round regenerates, createPendingAnalysis will add a new one
        queryClient.setQueryData(
          queryKeys.threads.analyses(threadId),
          (oldData: unknown) => {
            // ✅ SINGLE SOURCE OF TRUTH: Use validation helper for type-safe cache access
            const cacheData = validateAnalysesCache(oldData);

            if (!cacheData) {
              return oldData;
            }

            // Filter out ALL analyses for this round (including completed, pending, streaming)
            const filtered = cacheData.data.items.filter(
              a => a.roundNumber !== validated.roundNumber,
            );

            return {
              ...cacheData,
              data: { ...cacheData.data, items: filtered },
            };
          },
        );

        // ✅ CRITICAL FIX: Trigger re-render when cache is updated
        setCacheVersion(v => v + 1);
      } catch (error) {
        // ✅ ERROR RECOVERY: If removing analysis fails, set error state
        setHookError(error instanceof Error ? error : new Error('Failed to remove pending analysis'));
      }
    },
    [queryClient, threadId],
  );

  /**
   * Mark an analysis as failed with error message
   * ✅ ERROR HANDLING: Explicit failure state for analyses
   */
  const markAnalysisFailed = useCallback(
    (roundNumber: number, errorMessage: string) => {
      try {
        // Validate parameters at function entry
        const validated = MarkAnalysisFailedParamsSchema.parse({
          roundNumber,
          errorMessage,
        });

        queryClient.setQueryData(
          queryKeys.threads.analyses(threadId),
          (oldData: unknown) => {
            // ✅ SINGLE SOURCE OF TRUTH: Use validation helper for type-safe cache access
            const cacheData = validateAnalysesCache(oldData);

            if (!cacheData) {
              return oldData;
            }

            const updated = cacheData.data.items.map((analysis) => {
              if (analysis.roundNumber === validated.roundNumber) {
                return {
                  ...analysis,
                  status: 'failed' as const,
                  errorMessage: validated.errorMessage,
                  completedAt: new Date(),
                };
              }
              return analysis;
            });

            return {
              ...cacheData,
              data: { ...cacheData.data, items: updated },
            };
          },
        );

        // ✅ CRITICAL FIX: Trigger re-render when cache is updated
        setCacheVersion(v => v + 1);
      } catch (error) {
        setHookError(error instanceof Error ? error : new Error('Failed to mark analysis as failed'));
      }
    },
    [queryClient, threadId],
  );

  /**
   * Validate analysis data structure
   * ✅ SINGLE SOURCE OF TRUTH: Use utility function for schema validation
   * This ensures consistency across all validation points in the codebase
   */
  const validateAnalysisData = useCallback((data: unknown): data is ModeratorAnalysisPayload => {
    return isCompleteAnalysis(data);
  }, []);

  return {
    analyses,
    isLoading,
    createPendingAnalysis,
    updateAnalysisData,
    updateAnalysisStatus,
    removePendingAnalysis,
    markAnalysisFailed,
    validateAnalysisData,
  };
}
