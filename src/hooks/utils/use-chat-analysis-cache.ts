/**
 * Chat Analysis Cache Management Utilities
 *
 * Centralized utilities for managing analysis query cache operations.
 * Eliminates duplication between ChatOverviewScreen and ChatThreadScreen.
 *
 * ✅ SINGLE SOURCE OF TRUTH: Analysis cache management
 * ✅ TYPE-SAFE: Proper types for all cache operations
 * ✅ REUSABLE: Used by both overview and thread screens
 *
 * Used by:
 * - /src/containers/screens/chat/ChatOverviewScreen.tsx
 * - /src/containers/screens/chat/ChatThreadScreen.tsx
 *
 * Reference: COMPREHENSIVE REFACTORING ANALYSIS:1.5
 */

'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import type { ModeratorAnalysisPayload, StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { queryKeys } from '@/lib/data/query-keys';

export type UseChatAnalysisCacheReturn = {
  /** Add a pending analysis to the cache */
  addPendingAnalysis: (analysis: Omit<StoredModeratorAnalysis, 'id'> & { id?: string }) => void;
  /** Remove an analysis from the cache by ID */
  removeAnalysis: (analysisId: string) => void;
  /** Update an analysis in the cache */
  updateAnalysis: (
    roundNumber: number,
    updates: Partial<StoredModeratorAnalysis> | ((current: StoredModeratorAnalysis) => StoredModeratorAnalysis),
  ) => void;
  /** Mark an analysis as completed with data */
  completeAnalysis: (roundNumber: number, data: ModeratorAnalysisPayload) => void;
  /** Mark an analysis as failed with error */
  failAnalysis: (roundNumber: number, errorMessage: string) => void;
};

/**
 * Hook for managing analysis cache operations
 *
 * @param threadId - Thread ID to manage analyses for
 * @returns Analysis cache management functions
 *
 * @example
 * const { addPendingAnalysis, completeAnalysis } = useChatAnalysisCache(threadId)
 *
 * // Add pending analysis
 * addPendingAnalysis({
 *   threadId,
 *   roundNumber: 1,
 *   status: 'pending',
 *   ...
 * })
 *
 * // Complete analysis when streaming finishes
 * completeAnalysis(1, analysisData)
 */
export function useChatAnalysisCache(threadId: string): UseChatAnalysisCacheReturn {
  const queryClient = useQueryClient();

  /**
   * Add a pending analysis to the cache
   */
  const addPendingAnalysis = useCallback(
    (analysis: Omit<StoredModeratorAnalysis, 'id'> & { id?: string }) => {
      queryClient.setQueryData(
        queryKeys.threads.analyses(threadId),
        (oldData: unknown) => {
          // Type assertion for the response structure
          const typedData = oldData as {
            success: boolean;
            data: {
              items: StoredModeratorAnalysis[];
            };
          } | undefined;

          const pendingAnalysis: StoredModeratorAnalysis = {
            id: analysis.id || `pending-${threadId}-${analysis.roundNumber}-${Date.now()}`,
            threadId: analysis.threadId,
            roundNumber: analysis.roundNumber,
            mode: analysis.mode,
            userQuestion: analysis.userQuestion,
            status: analysis.status,
            participantMessageIds: analysis.participantMessageIds,
            analysisData: analysis.analysisData,
            createdAt: analysis.createdAt,
            completedAt: analysis.completedAt,
            errorMessage: analysis.errorMessage,
          };

          if (!typedData?.success) {
            return {
              success: true,
              data: {
                items: [pendingAnalysis],
              },
            };
          }

          return {
            ...typedData,
            data: {
              ...typedData.data,
              items: [...(typedData.data.items || []), pendingAnalysis],
            },
          };
        },
      );
    },
    [queryClient, threadId],
  );

  /**
   * Remove an analysis from the cache by ID
   */
  const removeAnalysis = useCallback(
    (analysisId: string) => {
      queryClient.setQueryData(
        queryKeys.threads.analyses(threadId),
        (oldData: unknown) => {
          const typedData = oldData as {
            success: boolean;
            data: {
              items: StoredModeratorAnalysis[];
            };
          } | undefined;

          if (!typedData?.success) {
            return typedData;
          }

          const filteredItems = (typedData.data.items || []).filter(
            item => item.id !== analysisId,
          );

          return {
            ...typedData,
            data: {
              ...typedData.data,
              items: filteredItems,
            },
          };
        },
      );
    },
    [queryClient, threadId],
  );

  /**
   * Update an analysis in the cache
   */
  const updateAnalysis = useCallback(
    (
      roundNumber: number,
      updates: Partial<StoredModeratorAnalysis> | ((current: StoredModeratorAnalysis) => StoredModeratorAnalysis),
    ) => {
      queryClient.setQueryData(
        queryKeys.threads.analyses(threadId),
        (oldData: unknown) => {
          const typedData = oldData as {
            success: boolean;
            data: {
              items: StoredModeratorAnalysis[];
            };
          } | undefined;

          if (!typedData?.success) {
            return typedData;
          }

          const updatedItems = (typedData.data.items || []).map((analysis) => {
            if (analysis.roundNumber === roundNumber) {
              // Support both partial updates and updater functions
              if (typeof updates === 'function') {
                return updates(analysis);
              }
              return {
                ...analysis,
                ...updates,
              };
            }
            return analysis;
          });

          return {
            ...typedData,
            data: {
              ...typedData.data,
              items: updatedItems,
            },
          };
        },
      );
    },
    [queryClient, threadId],
  );

  /**
   * Mark an analysis as completed with data
   */
  const completeAnalysis = useCallback(
    (roundNumber: number, data: ModeratorAnalysisPayload) => {
      updateAnalysis(roundNumber, {
        status: 'completed',
        analysisData: data,
        completedAt: new Date(),
      });
    },
    [updateAnalysis],
  );

  /**
   * Mark an analysis as failed with error
   */
  const failAnalysis = useCallback(
    (roundNumber: number, errorMessage: string) => {
      updateAnalysis(roundNumber, {
        status: 'failed',
        errorMessage,
        completedAt: new Date(),
      });
    },
    [updateAnalysis],
  );

  return {
    addPendingAnalysis,
    removeAnalysis,
    updateAnalysis,
    completeAnalysis,
    failAnalysis,
  };
}
