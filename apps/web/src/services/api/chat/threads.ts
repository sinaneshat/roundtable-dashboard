/**
 * Chat Threads Service - Thread Management API
 *
 * 100% type-safe RPC service for chat thread operations
 * All types automatically inferred from backend Hono routes
 */

import { parseResponse } from 'hono/client';

import { createApiClient, createPublicApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Thread Operations
// ============================================================================

export type ListThreadsRequest = any;

export type ListThreadsResponse = any;

export type CreateThreadRequest = any;

export type CreateThreadResponse = any;

export type GetThreadRequest = any;

export type GetThreadResponse = any;

export type UpdateThreadRequest = any;

export type UpdateThreadResponse = any;

export type DeleteThreadRequest = any;

export type DeleteThreadResponse = any;

// ============================================================================
// Type Inference - Public Thread Operations
// ============================================================================

export type GetPublicThreadRequest = any;

export type GetPublicThreadResponse = any;

export type ListPublicThreadSlugsResponse = any;

export type GetThreadBySlugRequest = {
  param: { slug: string };
};

// Response type matches API: { success: true, data: { thread, participants, messages, ... } }
export type GetThreadBySlugResponse =
  | {
      success: true;
      data: {
        thread: import('@/types/api').ChatThread;
        participants: import('@/types/api').ChatParticipant[];
        messages: import('@/types/api').ChatMessage[];
        changelog?: import('@/types/api').ChatThreadChangelog[];
        user?: { name: string; image: string | null };
      };
    }
  | { success: false; error: string };

export type GetThreadSlugStatusRequest = any;

export type GetThreadSlugStatusResponse = any;

// ============================================================================
// Type Inference - Messages and Changelog
// ============================================================================

export type GetThreadMessagesRequest = any;

export type GetThreadMessagesResponse = any;

export type GetThreadChangelogRequest = any;

export type GetThreadChangelogResponse = any;

export type GetThreadRoundChangelogRequest = any;

export type GetThreadRoundChangelogResponse = any;

// ============================================================================
// Type Inference - Round Operations
// ============================================================================

export type SummarizeRoundRequest = any;

export type SummarizeRoundResponse = any;

// ============================================================================
// Type Inference - Stream Resumption
// ============================================================================

export type GetThreadStreamResumptionStateRequest = any;

export type GetThreadStreamResumptionStateResponse = any;

// ============================================================================
// Service Functions - Thread CRUD
// ============================================================================

/**
 * List chat threads with cursor pagination
 * Protected endpoint - requires authentication
 *
 * @param args - Request arguments with query params
 * @param options - Service options
 * @param options.cookieHeader - Pre-captured cookie header for server-side fire-and-forget prefetches
 */
export async function listThreadsService(
  args?: ListThreadsRequest,
  options?: { cookieHeader?: string },
) {
  const client = await createApiClient({ cookieHeader: options?.cookieHeader });
  const params: ListThreadsRequest = {
    query: args?.query ?? {},
  };
  return parseResponse(client.chat.threads.$get(params));
}

// ============================================================================
// Type Inference - Sidebar Thread Operations
// ============================================================================

export type ListSidebarThreadsRequest = any;

export type ListSidebarThreadsResponse = any;

/**
 * List sidebar threads with lightweight payload (essential fields only)
 * Protected endpoint - requires authentication
 *
 * @param args - Request arguments with query params
 * @param options - Service options
 * @param options.cookieHeader - Pre-captured cookie header for server-side prefetches
 */
export async function listSidebarThreadsService(
  args?: ListSidebarThreadsRequest,
  options?: { cookieHeader?: string },
) {
  const client = await createApiClient({ cookieHeader: options?.cookieHeader });
  return parseResponse(client.chat.threads.sidebar.$get({
    query: args?.query ?? {},
  }));
}

/**
 * Create a new chat thread with participants and optional first message
 * Protected endpoint - requires authentication
 */
export async function createThreadService(data: CreateThreadRequest) {
  const client = await createApiClient();
  const params: CreateThreadRequest = {
    json: data.json ?? {},
  };
  return parseResponse(client.chat.threads.$post(params));
}

/**
 * Get a specific thread by ID with participants and messages
 * Protected endpoint - requires authentication (ownership check)
 */
export async function getThreadService(data: GetThreadRequest) {
  const client = await createApiClient();
  const params: GetThreadRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.chat.threads[':id'].$get(params));
}

/**
 * Update thread details (title, favorite, public status, etc.)
 * Protected endpoint - requires authentication
 */
export async function updateThreadService(data: UpdateThreadRequest) {
  const client = await createApiClient();
  const params: UpdateThreadRequest = {
    param: data.param ?? { id: '' },
    json: data.json ?? {},
  };
  return parseResponse(client.chat.threads[':id'].$patch(params));
}

/**
 * Delete a chat thread
 * Protected endpoint - requires authentication
 */
export async function deleteThreadService(data: DeleteThreadRequest) {
  const client = await createApiClient();
  const params: DeleteThreadRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.chat.threads[':id'].$delete(params));
}

// ============================================================================
// Service Functions - Public Thread Operations
// ============================================================================

/**
 * Get a public thread by slug (no authentication required)
 * Public endpoint - uses createPublicApiClient() for ISR/SSG compatibility
 */
export async function getPublicThreadService(data: GetPublicThreadRequest) {
  const client = await createPublicApiClient();
  const params: GetPublicThreadRequest = {
    param: data.param ?? { slug: '' },
  };
  return parseResponse(client.chat.public[':slug'].$get(params));
}

/**
 * List all public thread slugs for SSG/ISR page generation
 * Public endpoint - uses createPublicApiClient() for ISR/SSG compatibility
 */
export async function listPublicThreadSlugsService(): Promise<ListPublicThreadSlugsResponse> {
  const client = await createPublicApiClient();
  return parseResponse(client.chat.public.slugs.$get());
}

/**
 * Get a thread by slug for the authenticated user
 * Protected endpoint - requires authentication (ownership check)
 */
export async function getThreadBySlugService(data: GetThreadBySlugRequest): Promise<GetThreadBySlugResponse> {
  const client = await createApiClient();
  const params: GetThreadBySlugRequest = {
    param: data.param ?? { slug: '' },
  };
  return parseResponse(client.chat.threads.slug[':slug'].$get(params)) as Promise<GetThreadBySlugResponse>;
}

/**
 * Get thread slug status (for polling during AI title generation)
 * Protected endpoint - requires authentication (ownership check)
 */
export async function getThreadSlugStatusService(data: GetThreadSlugStatusRequest) {
  const client = await createApiClient();
  const params: GetThreadSlugStatusRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.chat.threads[':id']['slug-status'].$get(params));
}

// ============================================================================
// Service Functions - Messages and Changelog
// ============================================================================

/**
 * Get messages for a thread
 * Protected endpoint - requires authentication (ownership check)
 */
export async function getThreadMessagesService(data: GetThreadMessagesRequest) {
  const client = await createApiClient();
  const params: GetThreadMessagesRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.chat.threads[':id'].messages.$get(params));
}

/**
 * Get configuration changelog for a thread
 * Protected endpoint - requires authentication (ownership check)
 *
 * @param data - Request arguments with thread id
 * @param options - Service options
 * @param options.cookieHeader - Pre-captured cookie header for server-side fire-and-forget prefetches
 */
export async function getThreadChangelogService(
  data: GetThreadChangelogRequest,
  options?: { cookieHeader?: string },
) {
  const client = await createApiClient({ cookieHeader: options?.cookieHeader });
  const params: GetThreadChangelogRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.chat.threads[':id'].changelog.$get(params));
}

/**
 * Get configuration changelog for a specific round
 * Protected endpoint - requires authentication (ownership check)
 */
export async function getThreadRoundChangelogService(data: GetThreadRoundChangelogRequest) {
  const client = await createApiClient();
  const params: GetThreadRoundChangelogRequest = {
    param: data.param ?? { threadId: '', roundNumber: '0' },
  };
  return parseResponse(client.chat.threads[':threadId'].rounds[':roundNumber'].changelog.$get(params));
}

// ============================================================================
// Service Functions - Stream Resumption
// ============================================================================

/**
 * Get stream resumption state for server-side prefetching
 * Protected endpoint - requires authentication (ownership check)
 */
export async function getThreadStreamResumptionStateService(data: GetThreadStreamResumptionStateRequest) {
  const client = await createApiClient();
  const params: GetThreadStreamResumptionStateRequest = {
    param: data.param ?? { threadId: '' },
  };
  return parseResponse(client.chat.threads[':threadId']['stream-status'].$get(params));
}

// ============================================================================
// Type Inference - Auto Mode Prompt Analysis
// ============================================================================

export type AnalyzePromptRequest = any;

export type AnalyzePromptResponse = any;

// ============================================================================
// Service Functions - Auto Mode
// ============================================================================

/**
 * Execute analyze prompt SSE stream
 * Protected endpoint - requires authentication
 *
 * Returns SSE stream with events: start, config, done, failed
 * EXCEPTION: Does NOT parse response because SSE streams must return raw Response
 * object for EventSource/ReadableStream processing.
 */
export async function analyzePromptStreamService(data: AnalyzePromptRequest) {
  const client = await createApiClient();
  return client.chat.analyze.$post(data);
}
