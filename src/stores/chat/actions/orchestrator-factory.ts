/**
 * Generic Orchestrator Factory
 *
 * Creates type-safe orchestrator hooks for syncing server data to Zustand store.
 * Eliminates code duplication between analysis-orchestrator.ts and pre-search-orchestrator.ts
 *
 * PATTERN: Factory function with generics for reusable orchestration logic
 * USAGE: Create specialized orchestrators by providing configuration
 *
 * ✅ DRY: Single implementation for all orchestrators
 * ✅ TYPE-SAFE: Full generic constraints and inference
 * ✅ PERFORMANCE: Shallow comparison, optimized merging
 *
 * Location: /src/stores/chat/actions/orchestrator-factory.ts
 * Used by: analysis-orchestrator.ts, pre-search-orchestrator.ts
 *
 * @example
 * const useAnalysisOrchestrator = createOrchestrator({
 *   queryHook: useThreadAnalysesQuery,
 *   storeSelector: s => s.analyses,
 *   storeSetter: s => s.setAnalyses,
 *   extractItems: response => response?.data?.items || [],
 *   transformItems: transformModeratorAnalyses,
 *   getItemKey: item => item.roundNumber,
 *   getItemPriority: item => getStatusPriority(item.status),
 *   compareKeys: ['roundNumber', 'status', 'id', 'analysisData'],
 *   deduplicationHook: useAnalysisDeduplication,
 * });
 */

'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';

import { hasStateChanged, mergeServerClientState } from '@/lib/utils/state-merge';

/**
 * Configuration for creating an orchestrator hook
 *
 * @template TRaw - Raw item type from server (before transformation)
 * @template TItem - Transformed item type stored in state
 * @template TKey - Key type for deduplication (string or number)
 * @template TResponse - API response type containing items
 * @template TQueryArgs - Additional arguments for query hook
 */
export type OrchestratorConfig<
  TRaw,
  TItem,
  TKey extends string | number,
  TResponse = unknown,
  TQueryArgs extends readonly unknown[] = readonly [],
> = {
  /**
   * TanStack Query hook that fetches data from server
   * @example useThreadAnalysesQuery
   */
  queryHook: (threadId: string, enabled: boolean, ...args: TQueryArgs) => UseQueryResult<TResponse>;

  /**
   * Zustand store selector to get current items from store
   * @example s => s.analyses
   */
  storeSelector: (store: unknown) => TItem[];

  /**
   * Zustand store setter to update items in store
   * @example s => s.setAnalyses
   */
  storeSetter: (store: unknown) => (items: TItem[]) => void;

  /**
   * Extract items array from query response
   * @example response => response?.data?.items || []
   */
  extractItems: (response: TResponse | undefined) => TRaw[];

  /**
   * Transform raw server items to store format (e.g., date transformation)
   * @example transformModeratorAnalyses
   */
  transformItems: (items: TRaw[]) => TItem[];

  /**
   * Extract unique key from item for deduplication
   * @example item => item.roundNumber
   */
  getItemKey: (item: TItem) => TKey;

  /**
   * Calculate priority for item (higher priority wins in merge)
   * @example item => getStatusPriority(item.status)
   */
  getItemPriority: (item: TItem) => number;

  /**
   * Properties to compare for change detection
   * @example ['roundNumber', 'status', 'id', 'analysisData']
   */
  compareKeys: (keyof TItem)[];

  /**
   * Optional deduplication hook for additional processing
   * @example useAnalysisDeduplication
   */
  deduplicationHook?: (
    items: TItem[],
    options?: Record<string, unknown>,
  ) => TItem[];

  /**
   * Optional options to pass to deduplication hook
   * @example { regeneratingRoundNumber }
   */
  deduplicationOptions?: Record<string, unknown>;
};

/**
 * Options passed to orchestrator hook instance
 */
export type OrchestratorOptions<TQueryArgs extends readonly unknown[] = readonly []> = {
  /** Thread ID to fetch data for */
  threadId: string;
  /** Whether orchestrator is enabled (controls query and sync) */
  enabled?: boolean;
  /** Additional query arguments */
  queryArgs?: TQueryArgs;
};

/**
 * Return type of orchestrator hook
 */
export type OrchestratorReturn = {
  /** Whether items are loading from server */
  isLoading: boolean;
};

/**
 * Creates a type-safe orchestrator hook for server/store synchronization
 *
 * Handles common orchestration patterns:
 * 1. Query server data via TanStack Query hook
 * 2. Transform raw data to store format
 * 3. Deduplicate items (optional)
 * 4. Merge server data with optimistic client updates by priority
 * 5. Sync merged data to store when changes detected
 *
 * @template TRaw - Raw item type from server
 * @template TItem - Transformed item type in store
 * @template TKey - Key type for deduplication
 * @template TResponse - API response type
 * @template TQueryArgs - Additional query arguments
 *
 * @param config - Orchestrator configuration
 * @returns Hook function for orchestrating data sync
 *
 * @example
 * // Create analysis orchestrator
 * const useAnalysisOrchestrator = createOrchestrator({
 *   queryHook: useThreadAnalysesQuery,
 *   storeSelector: s => s.analyses,
 *   storeSetter: s => s.setAnalyses,
 *   extractItems: response => response?.data?.items || [],
 *   transformItems: transformModeratorAnalyses,
 *   getItemKey: item => item.roundNumber,
 *   getItemPriority: item => getStatusPriority(item.status),
 *   compareKeys: ['roundNumber', 'status', 'id', 'analysisData'],
 *   deduplicationHook: useAnalysisDeduplication,
 * });
 *
 * // Use in component
 * const { isLoading } = useAnalysisOrchestrator({
 *   threadId: 'thread-123',
 *   enabled: true
 * });
 */
export function createOrchestrator<
  TRaw,
  TItem,
  TKey extends string | number,
  TResponse = unknown,
  TQueryArgs extends readonly unknown[] = readonly [],
>(
  config: OrchestratorConfig<TRaw, TItem, TKey, TResponse, TQueryArgs>,
) {
  const {
    queryHook,
    storeSelector,
    storeSetter,
    extractItems,
    transformItems,
    getItemKey,
    getItemPriority,
    compareKeys,
    deduplicationHook,
    deduplicationOptions,
  } = config;

  /**
   * Generated orchestrator hook
   *
   * Syncs server data to store following established patterns:
   * - Query → Transform → Deduplicate → Merge → Sync
   * - Disabled when enabled=false to prevent stale data sync
   * - Shallow comparison for efficient change detection
   */
  return function useOrchestrator(
    options: OrchestratorOptions<TQueryArgs>,
  ): OrchestratorReturn {
    const { threadId, enabled = true, queryArgs = [] as unknown as TQueryArgs } = options;

    // Get store state and actions (using generic hook pattern)
    const useStore = <T>(selector: (store: unknown) => T): T => {
      // eslint-disable-next-line ts/no-require-imports
      const { useChatStore } = require('@/components/providers/chat-store-provider') as {
        useChatStore: <U>(selector: (store: unknown) => U) => U;
      };
      return useChatStore(selector);
    };

    const currentItems = useStore<TItem[]>(storeSelector);
    const setItems = useStore<(items: TItem[]) => void>(storeSetter);

    // Query server data
    const { data: response, isLoading } = queryHook(
      threadId,
      enabled,
      ...(queryArgs as never),
    );

    // Extract and transform items from response
    const rawItems = useMemo((): TItem[] => {
      const extracted = extractItems(response);
      return transformItems(extracted);
    }, [response]);

    // Apply optional deduplication
    const processedItems = useMemo(() => {
      if (deduplicationHook) {
        return deduplicationHook(rawItems, deduplicationOptions);
      }
      return rawItems;
    }, [rawItems]);

    // Track previous state for change detection
    const prevItemsRef = useRef<TItem[]>([]);

    // Sync server items to store when they change
    useEffect(() => {
      // ✅ CRITICAL: Don't sync when disabled
      // When disabled, query doesn't fetch, so syncing would use stale data
      if (!enabled) {
        return;
      }

      // ✅ SHARED UTILITY: Merge server/client state by priority
      const { mergedItems } = mergeServerClientState(
        processedItems,
        currentItems,
        getItemKey,
        getItemPriority,
      );

      // ✅ PERFORMANCE: Shallow comparison instead of JSON.stringify
      const itemsChanged = hasStateChanged(
        prevItemsRef.current,
        mergedItems,
        compareKeys,
      );

      if (itemsChanged) {
        prevItemsRef.current = mergedItems;
        setItems(mergedItems);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, processedItems, currentItems]);

    return {
      isLoading,
    };
  };
}
