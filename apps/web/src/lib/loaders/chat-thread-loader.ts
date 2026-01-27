/**
 * Shared Chat Thread Loader Utilities
 *
 * Unified loader logic for both normal chat threads (/chat/$slug)
 * and project sub-threads (/chat/projects/$projectId/$slug)
 *
 * Key consistency fixes:
 * - All error returns include streamResumption: undefined
 * - Consistent threadId access patterns
 * - Shared auxiliary data fetching logic
 */

import type { QueryClient } from '@tanstack/react-query';

import {
  threadBySlugQueryOptions,
  threadChangelogQueryOptions,
  threadFeedbackQueryOptions,
  threadPreSearchesQueryOptions,
} from '@/lib/data/query-options';
import { rlog } from '@/lib/utils/dev-logger';
import type {
  ChangelogItem,
  GetThreadBySlugResponse,
  GetThreadFeedbackResponse,
  RoundFeedbackData,
  StoredPreSearch,
} from '@/services/api';

// ============================================================================
// Types - Zod-first definitions (single source of truth)
// ============================================================================

/**
 * Base loader data shape for all chat thread routes
 * CRITICAL: streamResumption must ALWAYS be included for consistent hydration
 */
export interface ChatThreadLoaderData {
  threadTitle: string | null;
  threadId: string | null;
  threadData: GetThreadBySlugResponse['data'] | null;
  preSearches: StoredPreSearch[] | undefined;
  changelog: ChangelogItem[] | undefined;
  feedback: RoundFeedbackData[] | undefined;
  streamResumption: undefined;
}

/**
 * Extended loader data for project sub-threads
 * Includes projectName for breadcrumb display
 */
export interface ProjectChatThreadLoaderData extends ChatThreadLoaderData {
  projectName: string | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates empty/error loader data with consistent shape
 * CRITICAL: Always includes streamResumption: undefined to prevent hydration mismatches
 */
export function createEmptyLoaderData(): ChatThreadLoaderData;
export function createEmptyLoaderData(opts: { projectName: string | null }): ProjectChatThreadLoaderData;
export function createEmptyLoaderData(opts?: { projectName?: string | null }): ChatThreadLoaderData | ProjectChatThreadLoaderData {
  const base: ChatThreadLoaderData = {
    threadTitle: null,
    threadId: null,
    threadData: null,
    preSearches: undefined,
    changelog: undefined,
    feedback: undefined,
    streamResumption: undefined, // ALWAYS include - prevents hydration mismatch
  };

  if (opts && 'projectName' in opts) {
    return { ...base, projectName: opts.projectName };
  }

  return base;
}

// ============================================================================
// Auxiliary Data Fetching
// ============================================================================

interface AuxiliaryDataResult {
  preSearches: StoredPreSearch[] | undefined;
  changelog: ChangelogItem[] | undefined;
  feedback: RoundFeedbackData[] | undefined;
}

/**
 * Fetches auxiliary data (changelog, preSearches, feedback) for a thread
 * Handles both server-side (await all) and client-side (cache-first) patterns
 */
async function fetchAuxiliaryData({
  queryClient,
  threadId,
  isServer,
}: {
  queryClient: QueryClient;
  threadId: string;
  isServer: boolean;
}): Promise<AuxiliaryDataResult> {
  const changelogOptions = threadChangelogQueryOptions(threadId);
  const feedbackOptions = threadFeedbackQueryOptions(threadId);
  const preSearchesOptions = threadPreSearchesQueryOptions(threadId);

  if (isServer) {
    // On server, await all for proper hydration
    const [changelogResult, feedbackResult, preSearchesResult] = await Promise.all([
      queryClient.ensureQueryData(changelogOptions).catch(() => null),
      queryClient.ensureQueryData(feedbackOptions).catch(() => null),
      queryClient.ensureQueryData(preSearchesOptions).catch(() => null),
    ]);

    return {
      changelog: changelogResult?.success ? changelogResult.data?.items : undefined,
      feedback: feedbackResult?.success ? feedbackResult.data : undefined,
      preSearches: preSearchesResult?.success ? preSearchesResult.data?.items : undefined,
    };
  }

  // On client, check cache first, then fetch missing data
  const cachedChangelog = queryClient.getQueryData(changelogOptions.queryKey);
  const cachedPreSearches = queryClient.getQueryData(preSearchesOptions.queryKey);
  const cachedFeedback = queryClient.getQueryData<GetThreadFeedbackResponse>(feedbackOptions.queryKey);

  const [changelogResult, preSearchesResult] = await Promise.all([
    cachedChangelog
      ? Promise.resolve(cachedChangelog)
      : queryClient.ensureQueryData(changelogOptions).catch(() => null),
    cachedPreSearches
      ? Promise.resolve(cachedPreSearches)
      : queryClient.ensureQueryData(preSearchesOptions).catch(() => null),
  ]);

  // Prefetch missing feedback in background
  if (!cachedFeedback) {
    queryClient.prefetchQuery(feedbackOptions).catch(() => {});
  }

  return {
    changelog: changelogResult?.success ? changelogResult.data?.items : undefined,
    feedback: cachedFeedback?.success ? cachedFeedback.data : undefined,
    preSearches: preSearchesResult?.success ? preSearchesResult.data?.items : undefined,
  };
}

/**
 * Fetches auxiliary data for prefetch-hit scenario (cached thread data)
 * Only fetches changelog and preSearches, uses cached feedback
 */
async function fetchAuxiliaryDataForPrefetch({
  queryClient,
  threadId,
}: {
  queryClient: QueryClient;
  threadId: string;
}): Promise<AuxiliaryDataResult> {
  const changelogOptions = threadChangelogQueryOptions(threadId);
  const feedbackOptions = threadFeedbackQueryOptions(threadId);
  const preSearchesOptions = threadPreSearchesQueryOptions(threadId);

  // Check cache first, then fetch missing data
  const cachedChangelog = queryClient.getQueryData(changelogOptions.queryKey);
  const cachedPreSearches = queryClient.getQueryData(preSearchesOptions.queryKey);
  const cachedFeedback = queryClient.getQueryData<GetThreadFeedbackResponse>(feedbackOptions.queryKey);

  const [changelogResult, preSearchesResult] = await Promise.all([
    cachedChangelog
      ? Promise.resolve(cachedChangelog)
      : queryClient.ensureQueryData(changelogOptions).catch(() => null),
    cachedPreSearches
      ? Promise.resolve(cachedPreSearches)
      : queryClient.ensureQueryData(preSearchesOptions).catch(() => null),
  ]);

  // Prefetch missing feedback in background
  if (!cachedFeedback) {
    queryClient.prefetchQuery(feedbackOptions).catch(() => {});
  }

  return {
    changelog: changelogResult?.success ? changelogResult.data?.items : undefined,
    feedback: cachedFeedback?.success ? cachedFeedback.data : undefined,
    preSearches: preSearchesResult?.success ? preSearchesResult.data?.items : undefined,
  };
}

// ============================================================================
// Main Loader Function
// ============================================================================

interface FetchThreadDataParams {
  queryClient: QueryClient;
  slug: string;
  isServer: boolean;
  loaderContext: string; // e.g., 'normal-route' or 'project-route'
}

/**
 * Shared thread data fetching logic
 * Returns thread data and auxiliary data with consistent shape
 */
export async function fetchThreadData({
  queryClient,
  slug,
  isServer,
  loaderContext,
}: FetchThreadDataParams): Promise<ChatThreadLoaderData> {
  const options = threadBySlugQueryOptions(slug);

  rlog.init('loader', `${loaderContext} slug=${slug} server=${isServer ? 1 : 0}`);

  // Check cache for prefetched thread data (from flow-controller)
  const cachedThreadData = !isServer
    ? queryClient.getQueryData<GetThreadBySlugResponse>(options.queryKey)
    : null;
  const hasPrefetchMeta = cachedThreadData?.meta?.requestId === 'prefetch';

  // Early return when flow-controller prefetched VALID data (must have messages)
  // CRITICAL: "Shell" data (thread metadata without messages) should NOT trigger early return
  // This prevents blank screen when sidebar prefetch caches incomplete data
  // FIX: Still fetch auxiliary data (changelog, preSearches, feedback) to show configuration changes
  if (hasPrefetchMeta && cachedThreadData?.success && cachedThreadData.data.messages.length > 0) {
    const threadData = cachedThreadData.data;
    const prefetchThreadId = threadData.thread.id;
    rlog.init('loader', `${loaderContext} prefetch-hit: ${threadData.thread.slug} msgs=${threadData.messages.length}`);

    // Fetch auxiliary data even on prefetch hit to ensure changelog/preSearches/feedback are available
    let auxiliaryData: AuxiliaryDataResult = {
      changelog: undefined,
      feedback: undefined,
      preSearches: undefined,
    };

    if (prefetchThreadId) {
      auxiliaryData = await fetchAuxiliaryDataForPrefetch({
        queryClient,
        threadId: prefetchThreadId,
      });
    }

    return {
      threadTitle: threadData.thread.title ?? null,
      threadId: prefetchThreadId ?? null,
      threadData,
      preSearches: auxiliaryData.preSearches,
      changelog: auxiliaryData.changelog,
      feedback: auxiliaryData.feedback,
      streamResumption: undefined,
    };
  }

  // No prefetch hit - fetch thread data
  try {
    await queryClient.ensureQueryData(options);
  } catch (error) {
    console.error(`[${loaderContext}] Loader error:`, error);
    return createEmptyLoaderData();
  }

  const cachedData = queryClient.getQueryData<GetThreadBySlugResponse>(options.queryKey);
  const threadId = cachedData?.success && cachedData.data?.thread?.id;
  const threadTitle = cachedData?.success && cachedData.data?.thread?.title
    ? cachedData.data.thread.title
    : null;

  let auxiliaryData: AuxiliaryDataResult = {
    changelog: undefined,
    feedback: undefined,
    preSearches: undefined,
  };

  if (threadId) {
    auxiliaryData = await fetchAuxiliaryData({
      queryClient,
      threadId,
      isServer,
    });
  }

  const threadData = cachedData?.success ? cachedData.data : null;

  return {
    threadTitle,
    threadId: threadId || null,
    threadData,
    preSearches: auxiliaryData.preSearches,
    changelog: auxiliaryData.changelog,
    feedback: auxiliaryData.feedback,
    streamResumption: undefined,
  };
}
