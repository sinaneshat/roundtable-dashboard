/**
 * Auto Mode Analysis Actions - Consolidated Logic
 *
 * Single source of truth for auto mode prompt analysis.
 * Handles:
 * - Streaming config analysis from AI
 * - Applying results to chat store (selectedParticipants, mode, webSearch)
 * - Syncing to preferences store for persistence
 *
 * Used by both ChatView and ChatOverviewScreen to eliminate duplication.
 */

import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useChatStore, useModelPreferencesStore } from '@/components/providers';
import { useAnalyzePromptStream } from '@/hooks/utils';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';

type AutoModeAnalysisOptions = {
  prompt: string;
  /** ✅ GRANULAR: Whether image files are attached - requires supports_vision */
  hasImageFiles?: boolean;
  /** ✅ GRANULAR: Whether document files (PDFs, DOC, etc.) are attached - requires supports_file */
  hasDocumentFiles?: boolean;
  /**
   * Set of model IDs accessible to the user from the client's models API.
   * Used to filter server response - prevents setting participants that would
   * immediately be filtered out by the incompatible models effect.
   */
  accessibleModelIds?: Set<string>;
};

export type UseAutoModeAnalysisReturn = {
  /** Analyze prompt and apply recommended config to stores */
  analyzeAndApply: (options: AutoModeAnalysisOptions) => Promise<boolean>;
  /** Whether analysis is currently in progress */
  isAnalyzing: boolean;
  /** Current partial config being streamed (for UI preview) */
  partialConfig: ReturnType<typeof useAnalyzePromptStream>['partialConfig'];
  /** Abort ongoing analysis */
  abort: () => void;
};

/**
 * Consolidated auto mode analysis hook
 *
 * Combines streaming analysis with store updates to eliminate
 * duplicated logic between ChatView and ChatOverviewScreen.
 *
 * @param syncToPreferences - Whether to sync results to preferences store (default: true)
 */
export function useAutoModeAnalysis(syncToPreferences = true): UseAutoModeAnalysisReturn {
  const { streamConfig, isStreaming, partialConfig, abort } = useAnalyzePromptStream();

  const chatStoreActions = useChatStore(useShallow(s => ({
    setIsAnalyzingPrompt: s.setIsAnalyzingPrompt,
    setSelectedParticipants: s.setSelectedParticipants,
    setModelOrder: s.setModelOrder,
    setSelectedMode: s.setSelectedMode,
    setEnableWebSearch: s.setEnableWebSearch,
  })));

  // Preferences store actions for persistence sync
  const preferencesActions = useModelPreferencesStore(useShallow(s => ({
    setSelectedModelIds: s.setSelectedModelIds,
    setModelOrder: s.setModelOrder,
    setSelectedMode: s.setSelectedMode,
    setEnableWebSearch: s.setEnableWebSearch,
  })));

  const analyzeAndApply = useCallback(async (options: AutoModeAnalysisOptions): Promise<boolean> => {
    const { prompt, hasImageFiles = false, hasDocumentFiles = false, accessibleModelIds } = options;

    chatStoreActions.setIsAnalyzingPrompt(true);

    try {
      const result = await streamConfig({ prompt, hasImageFiles, hasDocumentFiles });

      if (result) {
        const { participants, mode: recommendedMode, enableWebSearch: recommendedWebSearch } = result;

        // Transform to ParticipantConfig format
        let newParticipants: ParticipantConfig[] = participants.map((p, index) => ({
          id: p.modelId,
          modelId: p.modelId,
          role: p.role || '',
          priority: index,
        }));

        // Filter by client-accessible models if provided
        // This prevents setting participants that would immediately be filtered
        // out by the incompatible models effect due to tier mismatch
        if (accessibleModelIds && accessibleModelIds.size > 0) {
          const filteredParticipants = newParticipants.filter(
            p => accessibleModelIds.has(p.modelId),
          );
          // Only apply filter if it leaves at least 1 participant
          // If all filtered out, keep original (server says they're accessible)
          if (filteredParticipants.length > 0) {
            newParticipants = filteredParticipants.map((p, index) => ({
              ...p,
              priority: index,
            }));
          }
        }

        const modelIds = newParticipants.map(p => p.modelId);

        // Update chat store
        chatStoreActions.setSelectedParticipants(newParticipants);
        chatStoreActions.setModelOrder(modelIds);
        chatStoreActions.setSelectedMode(recommendedMode as any);
        chatStoreActions.setEnableWebSearch(recommendedWebSearch);

        // Sync to preferences for persistence
        if (syncToPreferences) {
          preferencesActions.setSelectedModelIds(modelIds);
          preferencesActions.setModelOrder(modelIds);
          preferencesActions.setSelectedMode(recommendedMode);
          preferencesActions.setEnableWebSearch(recommendedWebSearch);
        }

        return true;
      }

      return false;
    } catch (error) {
      console.error('[useAutoModeAnalysis] Analysis failed:', error);
      return false;
    } finally {
      chatStoreActions.setIsAnalyzingPrompt(false);
    }
  }, [streamConfig, chatStoreActions, syncToPreferences, preferencesActions]);

  return {
    analyzeAndApply,
    isAnalyzing: isStreaming,
    partialConfig,
    abort,
  };
}
