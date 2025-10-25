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

import type { ChatParticipant, ModeratorAnalysisPayload, StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { ModeratorAnalysisPayloadSchema } from '@/api/routes/chat/schema';
import { useThreadAnalysesQuery } from '@/hooks/queries/chat';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { queryKeys } from '@/lib/data/query-keys';

type UseChatAnalysisOptions = {
  threadId: string;
  mode: ChatModeId;
  /**
   * ✅ STREAMING PROTECTION: Disable query during active streaming
   * This prevents refetches from disrupting the streaming state
   */
  enabled?: boolean;
};

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

export function useChatAnalysis({
  threadId,
  mode,
  enabled = true,
}: UseChatAnalysisOptions): UseChatAnalysisReturn {
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
        // ✅ CRITICAL FIX: Extract message IDs from the CURRENT round only
        // Handle potential type mismatches between stored and parameter roundNumber
        const roundMessages = messages.filter((m) => {
          const metadata = m.metadata as Record<string, unknown> | undefined;

          // Ensure we're comparing numbers, not strings
          const messageRoundNumber = metadata?.roundNumber;
          const messageRound = typeof messageRoundNumber === 'number'
            ? messageRoundNumber
            : (typeof messageRoundNumber === 'string' ? Number(messageRoundNumber) : null);

          const targetRound = typeof roundNumber === 'number'
            ? roundNumber
            : Number(roundNumber);

          const isAssistant = m.role === 'assistant';
          const roundMatches = messageRound === targetRound;

          return roundMatches && isAssistant;
        });

        const participantMessageIds = roundMessages.map(m => m.id);

        // ✅ VALIDATION: Check if we have the expected number of participant messages
        const expectedCount = participants.filter(p => p.isEnabled).length;
        const actualCount = participantMessageIds.length;

        if (actualCount < expectedCount) {
          // ✅ RECOVERY: Round is incomplete - log warning
          console.warn(`[useChatAnalysis] Incomplete round ${roundNumber}: Expected ${expectedCount} participant messages, but found ${actualCount}`, {
            threadId,
            roundNumber,
            expectedCount,
            actualCount,
            participantMessageIds,
            enabledParticipants: participants.filter(p => p.isEnabled).map(p => ({ id: p.id, modelId: p.modelId })),
          });

          // ✅ FIX: During regeneration, participants might still be streaming
          // Allow creating pending analysis even if count doesn't match yet
          // The backend will handle validation when streaming completes
          // Continue instead of returning early
        }

        if (actualCount > expectedCount) {
          // ✅ VALIDATION: More messages than expected - this shouldn't happen but handle gracefully
          console.warn(`[useChatAnalysis] Extra messages in round ${roundNumber}: Expected ${expectedCount} participant messages, but found ${actualCount}`, {
            threadId,
            roundNumber,
            expectedCount,
            actualCount,
            participantMessageIds,
          });
        }

        const pendingAnalysis: StoredModeratorAnalysis = {
          id: `pending-${threadId}-${roundNumber}-${Date.now()}`,
          threadId,
          roundNumber,
          mode,
          userQuestion,
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
              a => a.roundNumber !== roundNumber || a.status === 'completed',
            );

            // Only add new pending analysis if no completed analysis exists for this round
            const hasCompletedAnalysis = typedData.data.items.some(
              a => a.roundNumber === roundNumber && a.status === 'completed',
            );

            if (hasCompletedAnalysis) {
              // Keep the completed analysis, don't add pending
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
        // ✅ ERROR RECOVERY: If creating pending analysis fails, log and set error state
        console.error('Failed to create pending analysis:', error);
        setHookError(error instanceof Error ? error : new Error('Failed to create pending analysis'));
      }
    },
    [queryClient, threadId, mode],
  );

  const updateAnalysisData = useCallback(
    (roundNumber: number, data: ModeratorAnalysisPayload) => {
      try {
        // ✅ VALIDATION: Validate analysis data before updating
        const validationResult = ModeratorAnalysisPayloadSchema.safeParse(data);
        if (!validationResult.success) {
          console.error('Invalid analysis data:', validationResult.error);
          setHookError(new Error('Invalid analysis data structure'));
          return;
        }

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
              if (analysis.roundNumber === roundNumber) {
                // ✅ CRITICAL FIX: Only update if status is pending or streaming
                // Don't overwrite already completed analyses (prevents regression)
                if (analysis.status === 'pending' || analysis.status === 'streaming') {
                  return {
                    ...analysis,
                    status: 'completed' as const,
                    analysisData: data,
                    completedAt: new Date(),
                    errorMessage: null, // Clear any previous errors
                  };
                }
                // ✅ If already completed, don't overwrite (prevents stale data from replacing fresh data)
                console.warn(`[useChatAnalysis] Skipping update for round ${roundNumber} - analysis already ${analysis.status}`);
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
        // ✅ ERROR RECOVERY: If updating analysis fails, log and set error state
        console.error('Failed to update analysis data:', error);
        setHookError(error instanceof Error ? error : new Error('Failed to update analysis data'));
      }
    },
    [queryClient, threadId],
  );

  const updateAnalysisStatus = useCallback(
    (roundNumber: number, status: 'pending' | 'streaming' | 'completed' | 'failed') => {
      try {
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
              if (analysis.roundNumber === roundNumber) {
                return {
                  ...analysis,
                  status,
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
        console.error('Failed to update analysis status:', error);
        setHookError(error instanceof Error ? error : new Error('Failed to update analysis status'));
      }
    },
    [queryClient, threadId],
  );

  const removePendingAnalysis = useCallback(
    (roundNumber: number) => {
      try {
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
              a => a.roundNumber !== roundNumber,
            );

            return {
              ...typedData,
              data: { ...typedData.data, items: filtered },
            };
          },
        );
      } catch (error) {
        // ✅ ERROR RECOVERY: If removing analysis fails, log and set error state
        console.error('Failed to remove pending analysis:', error);
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
              if (analysis.roundNumber === roundNumber) {
                return {
                  ...analysis,
                  status: 'failed' as const,
                  errorMessage,
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
        console.error('Failed to mark analysis as failed:', error);
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
    if (!result.success) {
      console.error('Analysis data validation failed:', result.error);
      return false;
    }
    return true;
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
