/**
 * Chat Analysis Hook
 *
 * Manages analysis state via React Query cache as single source of truth.
 * Backend auto-creates pending analyses; hook provides cache manipulation.
 */

'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { UIMessage } from 'ai';
import { useCallback, useMemo } from 'react';

import type { ChatParticipant, ModeratorAnalysisPayload, StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { useThreadAnalysesQuery } from '@/hooks/queries/chat-threads';
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
  removePendingAnalysis: (roundNumber: number) => void;
};

export function useChatAnalysis({
  threadId,
  mode,
  enabled = true,
}: UseChatAnalysisOptions): UseChatAnalysisReturn {
  const queryClient = useQueryClient();

  // ✅ STREAMING PROTECTION: Only enable query when explicitly allowed
  // This prevents the aggressive polling and refetchOnMount from disrupting streaming
  const { data: analysesResponse, isLoading } = useThreadAnalysesQuery(threadId, enabled && !!threadId);

  const analyses = useMemo(() => {
    if (!analysesResponse?.success)
      return [];

    return analysesResponse.data.items.map(item => ({
      ...item,
      createdAt: typeof item.createdAt === 'string' ? new Date(item.createdAt) : item.createdAt,
      completedAt: item.completedAt
        ? (typeof item.completedAt === 'string' ? new Date(item.completedAt) : item.completedAt)
        : null,
    }));
  }, [analysesResponse]);

  const createPendingAnalysis = useCallback(
    (
      roundNumber: number,
      messages: UIMessage[],
      participants: ChatParticipant[],
      userQuestion: string,
    ) => {
      const assistantMessages = messages.filter(m => m.role === 'assistant');
      const recentMessages = assistantMessages.slice(-participants.length);
      const participantMessageIds = recentMessages.map(m => m.id);

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

          if (!typedData?.success) {
            return {
              success: true,
              data: { items: [pendingAnalysis] },
            };
          }

          const existingIndex = typedData.data.items.findIndex(
            a => a.roundNumber === roundNumber,
          );

          if (existingIndex >= 0) {
            const updated = [...typedData.data.items];
            updated[existingIndex] = pendingAnalysis;
            return {
              ...typedData,
              data: { ...typedData.data, items: updated },
            };
          }

          return {
            ...typedData,
            data: {
              ...typedData.data,
              items: [...typedData.data.items, pendingAnalysis],
            },
          };
        },
      );
    },
    [queryClient, threadId, mode],
  );

  const updateAnalysisData = useCallback(
    (roundNumber: number, data: ModeratorAnalysisPayload) => {
      queryClient.setQueryData(
        queryKeys.threads.analyses(threadId),
        (oldData: unknown) => {
          const typedData = oldData as {
            success: boolean;
            data: { items: StoredModeratorAnalysis[] };
          } | undefined;

          if (!typedData?.success)
            return typedData;

          const updated = typedData.data.items.map((analysis) => {
            if (analysis.roundNumber === roundNumber) {
              return {
                ...analysis,
                status: 'completed' as const,
                analysisData: data,
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

      // ✅ ONE-WAY DATA FLOW: NO query invalidation
      // Cache is updated directly above - invalidation would trigger refetch and break streaming
      // The query is disabled during streaming anyway (enabled: false in ChatThreadScreen)
    },
    [queryClient, threadId],
  );

  const removePendingAnalysis = useCallback(
    (roundNumber: number) => {
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

          if (!typedData?.success)
            return typedData;

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
    },
    [queryClient, threadId],
  );

  return {
    analyses,
    isLoading,
    createPendingAnalysis,
    updateAnalysisData,
    removePendingAnalysis,
  };
}
