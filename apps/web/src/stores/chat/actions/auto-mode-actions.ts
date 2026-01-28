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

import { useChatStoreApi, useModelPreferencesStore } from '@/components/providers';
// Direct import avoids circular dependency through @/hooks/utils barrel
import { useAnalyzePromptStream } from '@/hooks/utils/use-analyze-prompt-stream';
import { MIN_PARTICIPANTS_REQUIRED } from '@/lib/config';
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
  const { abort, isStreaming, partialConfig, streamConfig } = useAnalyzePromptStream();

  // ✅ FIX: Use storeApi.getState() at invocation time instead of memoized selectors
  // The useShallow pattern captures actions at hook creation, which can become stale
  // when the callback is invoked later. Using getState() ensures fresh state/actions.
  const chatStoreApi = useChatStoreApi();

  // Preferences store actions for persistence sync
  const preferencesActions = useModelPreferencesStore(useShallow(s => ({
    setEnableWebSearch: s.setEnableWebSearch,
    setModelOrder: s.setModelOrder,
    setSelectedMode: s.setSelectedMode,
    setSelectedModelIds: s.setSelectedModelIds,
  })));

  const analyzeAndApply = useCallback(async (options: AutoModeAnalysisOptions): Promise<boolean> => {
    const { accessibleModelIds, hasDocumentFiles = false, hasImageFiles = false, prompt } = options;

    // ✅ Get fresh store state at invocation time
    const chatStore = chatStoreApi.getState();
    chatStore.setIsAnalyzingPrompt(true);

    try {
      // ✅ PASS CLIENT MODEL LIST: Send pre-filtered accessible model IDs to backend
      // Backend AI will ONLY pick from these models, ensuring consistency
      const accessibleModelIdsArray = accessibleModelIds ? Array.from(accessibleModelIds) : undefined;

      const result = await streamConfig({
        accessibleModelIds: accessibleModelIdsArray,
        hasDocumentFiles,
        hasImageFiles,
        prompt,
      });

      if (result) {
        const { enableWebSearch: recommendedWebSearch, mode: recommendedMode, participants } = result;


        // Transform to ParticipantConfig format
        // ✅ NO POST-FILTERING NEEDED: AI already picked from accessible models
        let newParticipants: ParticipantConfig[] = participants.map((p, index) => ({
          id: p.modelId,
          modelId: p.modelId,
          priority: index,
          role: p.role || '',
        }));

        // ✅ SAFETY CHECK: Validate returned models are in accessible list (defense in depth)
        // This shouldn't filter anything since AI was given the list, but protects against bugs
        if (accessibleModelIds && accessibleModelIds.size > 0) {
          const validParticipants = newParticipants.filter(
            p => accessibleModelIds.has(p.modelId),
          );

  
          // If AI returned invalid models (shouldn't happen), pad with accessible ones
          if (validParticipants.length < MIN_PARTICIPANTS_REQUIRED) {
            const usedModelIds = new Set(validParticipants.map(p => p.modelId));
            const availableFallbacks = Array.from(accessibleModelIds).filter(id => !usedModelIds.has(id));

            for (const modelId of availableFallbacks) {
              if (validParticipants.length >= MIN_PARTICIPANTS_REQUIRED) {
                break;
              }
              validParticipants.push({
                id: modelId,
                modelId,
                priority: validParticipants.length,
                role: '',
              });
            }
          }

          if (validParticipants.length > 0) {
            newParticipants = validParticipants.map((p, index) => ({
              ...p,
              priority: index,
            }));
          }
        }

        const modelIds = newParticipants.map(p => p.modelId);

        // Update chat store - use fresh getState() to ensure latest actions
        const storeState = chatStoreApi.getState();

        storeState.setSelectedParticipants(newParticipants);
        storeState.setModelOrder(modelIds);
        storeState.setSelectedMode(recommendedMode);
        storeState.setEnableWebSearch(recommendedWebSearch);

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
      chatStoreApi.getState().setIsAnalyzingPrompt(false);
    }
  }, [streamConfig, chatStoreApi, syncToPreferences, preferencesActions]);

  return {
    abort,
    analyzeAndApply,
    isAnalyzing: isStreaming,
    partialConfig,
  };
}
