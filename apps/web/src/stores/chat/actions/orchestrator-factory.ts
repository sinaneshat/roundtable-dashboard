/**
 * Generic orchestrator factory for syncing server data to Zustand store
 */

import type { UseQueryResult } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';

import { hasStateChanged, mergeServerClientState } from '@/lib/utils';
import type { ChatStore } from '@/stores/chat';

export type OrchestratorConfig<
  TRaw,
  TItem,
  TKey extends string | number,
  TResponse,
  TQueryArgs extends readonly unknown[] = readonly [],
  TDeduplicationOptions = undefined,
> = {
  queryHook: (threadId: string, enabled: boolean, ...args: TQueryArgs) => UseQueryResult<TResponse>;
  useStoreHook: <T>(selector: (store: ChatStore) => T) => T;
  storeSelector: (store: ChatStore) => TItem[];
  storeSetter: (store: ChatStore) => (items: TItem[]) => void;
  extractItems: (response: TResponse | undefined) => TRaw[];
  transformItems: (items: TRaw[]) => TItem[];
  getItemKey: (item: TItem) => TKey;
  getItemPriority: (item: TItem) => number;
  compareKeys: (keyof TItem)[];
  deduplicationHook?: (items: TItem[], options?: TDeduplicationOptions) => TItem[];
  deduplicationOptions?: TDeduplicationOptions;
};

export type OrchestratorOptions<
  TQueryArgs extends readonly unknown[] = readonly [],
  TDeduplicationOptions = undefined,
> = {
  threadId: string;
  enabled?: boolean;
  queryArgs?: TQueryArgs;
  deduplicationOptions?: TDeduplicationOptions;
};

export type OrchestratorReturn = {
  isLoading: boolean;
};

export function createOrchestrator<
  TRaw,
  TItem,
  TKey extends string | number,
  TResponse,
  TQueryArgs extends readonly unknown[] = readonly [],
  TDeduplicationOptions = undefined,
>(
  config: OrchestratorConfig<TRaw, TItem, TKey, TResponse, TQueryArgs, TDeduplicationOptions>,
) {
  const {
    queryHook,
    useStoreHook,
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

  return function useOrchestrator(
    options: OrchestratorOptions<TQueryArgs, TDeduplicationOptions>,
  ): OrchestratorReturn {
    const { threadId, enabled = true, deduplicationOptions: runtimeDeduplicationOptions } = options;
    // TYPE INFERENCE: Empty array default is compatible with TQueryArgs constraint
    const queryArgs = (options.queryArgs ?? []) as TQueryArgs;

    const mergedDeduplicationOptions = useMemo(
      (): TDeduplicationOptions | undefined => {
        if (deduplicationOptions === undefined && runtimeDeduplicationOptions === undefined) {
          return undefined;
        }
        // TYPE INFERENCE: Spread merge of compatible objects maintains TDeduplicationOptions shape
        return { ...deduplicationOptions, ...runtimeDeduplicationOptions } as TDeduplicationOptions;
      },
      [runtimeDeduplicationOptions],
    );

    const currentItems = useStoreHook<TItem[]>(storeSelector);
    const setItems = useStoreHook<(items: TItem[]) => void>(storeSetter);

    const { data: response, isLoading } = queryHook(
      threadId,
      enabled,
      ...(queryArgs as never),
    );

    const rawItems = useMemo((): TItem[] => {
      const extracted = extractItems(response);
      return transformItems(extracted);
    }, [response]);

    const processedItems = useMemo(() => {
      if (deduplicationHook) {
        return deduplicationHook(rawItems, mergedDeduplicationOptions);
      }
      return rawItems;
    }, [rawItems, mergedDeduplicationOptions]);

    const prevItemsRef = useRef<TItem[]>([]);

    useEffect(() => {
      if (!enabled) {
        return;
      }

      const { mergedItems } = mergeServerClientState(
        processedItems,
        currentItems,
        getItemKey,
        getItemPriority,
      );

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
