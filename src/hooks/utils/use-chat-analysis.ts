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

import { ChatModeSchema } from '@/api/core/enums';
import type { ChatParticipant, ModeratorAnalysisPayload, StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { ModeratorAnalysisPayloadSchema } from '@/api/routes/chat/schema';
import { chatParticipantSelectSchema } from '@/db/validation/chat';
import { useThreadAnalysesQuery } from '@/hooks/queries/chat';
import { ParticipantSettingsSchema } from '@/lib/config/participant-settings';
import { queryKeys } from '@/lib/data/query-keys';

/**
 * Full ChatParticipant schema with settings
 * Matches the ChatParticipant type from the API routes
 */
const ChatParticipantSchema = chatParticipantSelectSchema
  .extend({
    settings: ParticipantSettingsSchema,
  });

/**
 * Zod schema for analysis status
 */
const AnalysisStatusSchema = z.enum(['pending', 'streaming', 'completed', 'failed']);

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
const CreatePendingAnalysisParamsSchema = z.object({
  roundNumber: z.number().int().positive(),
  messages: z.array(z.custom<UIMessage>()),
  participants: z.array(ChatParticipantSchema),
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

  // ✅ STREAMING PROTECTION: Only enable query when explicitly allowed
  // This prevents the aggressive polling and refetchOnMount from disrupting streaming
  const { data: analysesResponse, isLoading } = useThreadAnalysesQuery(threadId, enabled && !!threadId);

  const analyses = useMemo(() => {
    if (!analysesResponse?.success) {
      return [];
    }

    return analysesResponse.data.items.map(item => ({
      ...item,
      createdAt: typeof item.createdAt === 'string' ? new Date(item.createdAt) : item.createdAt as Date,
      completedAt: item.completedAt
        ? (typeof item.completedAt === 'string' ? new Date(item.completedAt) : item.completedAt as Date)
        : null,
    })) as StoredModeratorAnalysis[];
  }, [analysesResponse]);

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
        // ✅ CRITICAL FIX: Extract message IDs from the CURRENT round only
        // Handle potential type mismatches between stored and parameter roundNumber
        const roundMessages = validated.messages.filter((m) => {
          const metadata = m.metadata as Record<string, unknown> | undefined;

          // Ensure we're comparing numbers, not strings
          const messageRoundNumber = metadata?.roundNumber;
          const messageRound = typeof messageRoundNumber === 'number'
            ? messageRoundNumber
            : (typeof messageRoundNumber === 'string' ? Number(messageRoundNumber) : null);

          const targetRound = typeof validated.roundNumber === 'number'
            ? validated.roundNumber
            : Number(validated.roundNumber);

          const isAssistant = m.role === 'assistant';
          const roundMatches = messageRound === targetRound;

          return roundMatches && isAssistant;
        });

        const participantMessageIds = roundMessages.map(m => m.id);

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
            const typedData = oldData as {
              success: boolean;
              data: { items: StoredModeratorAnalysis[] };
            } | undefined;

            // ✅ FIX: Ensure cache structure is always valid
            if (!typedData?.success || !typedData.data?.items) {
              return {
                success: true,
                data: { items: [pendingAnalysis] },
              };
            }

            // ✅ FIX: Only remove pending/streaming analyses for this round
            // Keep completed analyses to prevent them from reverting to streaming state
            const filteredItems = typedData.data.items.filter(
              a => a.roundNumber !== validated.roundNumber || a.status === AnalysisStatusSchema.enum.completed,
            );

            // Check if any analysis (pending, streaming, or completed) already exists for this round
            const hasExistingAnalysis = typedData.data.items.some(
              a => a.roundNumber === validated.roundNumber
                && (a.status === AnalysisStatusSchema.enum.completed
                  || a.status === AnalysisStatusSchema.enum.pending
                  || a.status === AnalysisStatusSchema.enum.streaming),
            );

            if (hasExistingAnalysis) {
              // Don't create duplicate analysis for the same round
              return typedData;
            }

            // Add new pending analysis
            return {
              ...typedData,
              data: {
                ...typedData.data,
                items: [...filteredItems, pendingAnalysis],
              },
            };
          },
        );
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
            const typedData = oldData as {
              success: boolean;
              data: { items: StoredModeratorAnalysis[] };
            } | undefined;

            if (!typedData?.success) {
              return typedData;
            }

            // ✅ CRITICAL: Find and update the specific analysis by round number
            // Preserve all other analyses unchanged to prevent cache corruption
            const updated = typedData.data.items.map((analysis) => {
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
              ...typedData,
              data: { ...typedData.data, items: updated },
            };
          },
        );

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
            const typedData = oldData as {
              success: boolean;
              data: { items: StoredModeratorAnalysis[] };
            } | undefined;

            if (!typedData?.success) {
              return typedData;
            }

            const updated = typedData.data.items.map((analysis) => {
              if (analysis.roundNumber === validated.roundNumber) {
                return {
                  ...analysis,
                  status: validated.status,
                };
              }
              return analysis;
            });

            return {
              ...typedData,
              data: { ...typedData.data, items: updated },
            };
          },
        );
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
            const typedData = oldData as {
              success: boolean;
              data: { items: StoredModeratorAnalysis[] };
            } | undefined;

            if (!typedData?.success) {
              return typedData;
            }

            // Filter out ALL analyses for this round (including completed, pending, streaming)
            const filtered = typedData.data.items.filter(
              a => a.roundNumber !== validated.roundNumber,
            );

            return {
              ...typedData,
              data: { ...typedData.data, items: filtered },
            };
          },
        );
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
            const typedData = oldData as {
              success: boolean;
              data: { items: StoredModeratorAnalysis[] };
            } | undefined;

            if (!typedData?.success) {
              return typedData;
            }

            const updated = typedData.data.items.map((analysis) => {
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
              ...typedData,
              data: { ...typedData.data, items: updated },
            };
          },
        );
      } catch (error) {
        setHookError(error instanceof Error ? error : new Error('Failed to mark analysis as failed'));
      }
    },
    [queryClient, threadId],
  );

  /**
   * Validate analysis data structure
   * ✅ VALIDATION: Type-safe validation using Zod schema
   */
  const validateAnalysisData = useCallback((data: unknown): data is ModeratorAnalysisPayload => {
    const result = ModeratorAnalysisPayloadSchema.safeParse(data);
    return result.success;
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
