/**
 * Chat Threads Service - Thread Management API
 *
 * 100% type-safe RPC service for chat thread operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/lib/api/client';
import { createApiClient, createPublicApiClient } from '@/lib/api/client';

// ============================================================================
// Type Inference - Thread Operations
// ============================================================================

type ListThreadsEndpoint = ApiClientType['chat']['threads']['$get'];
export type ListThreadsRequest = InferRequestType<ListThreadsEndpoint>;
export type ListThreadsResponse = InferResponseType<ListThreadsEndpoint>;

type CreateThreadEndpoint = ApiClientType['chat']['threads']['$post'];
export type CreateThreadRequest = InferRequestType<CreateThreadEndpoint>;
export type CreateThreadResponse = InferResponseType<CreateThreadEndpoint>;

type GetThreadEndpoint = ApiClientType['chat']['threads'][':id']['$get'];
export type GetThreadRequest = InferRequestType<GetThreadEndpoint>;
export type GetThreadResponse = InferResponseType<GetThreadEndpoint>;

type UpdateThreadEndpoint = ApiClientType['chat']['threads'][':id']['$patch'];
export type UpdateThreadRequest = InferRequestType<UpdateThreadEndpoint>;
export type UpdateThreadResponse = InferResponseType<UpdateThreadEndpoint>;

type DeleteThreadEndpoint = ApiClientType['chat']['threads'][':id']['$delete'];
export type DeleteThreadRequest = InferRequestType<DeleteThreadEndpoint>;
export type DeleteThreadResponse = InferResponseType<DeleteThreadEndpoint>;

// ============================================================================
// Type Inference - Public Thread Operations
// ============================================================================

type GetPublicThreadEndpoint = ApiClientType['chat']['public'][':slug']['$get'];
export type GetPublicThreadRequest = InferRequestType<GetPublicThreadEndpoint>;
export type GetPublicThreadResponse = InferResponseType<GetPublicThreadEndpoint>;

type ListPublicThreadSlugsEndpoint = ApiClientType['chat']['public']['slugs']['$get'];
export type ListPublicThreadSlugsResponse = InferResponseType<ListPublicThreadSlugsEndpoint>;

type GetThreadBySlugEndpoint = ApiClientType['chat']['threads']['slug'][':slug']['$get'];
export type GetThreadBySlugRequest = InferRequestType<GetThreadBySlugEndpoint>;
export type GetThreadBySlugResponse = InferResponseType<GetThreadBySlugEndpoint>;

type GetThreadSlugStatusEndpoint = ApiClientType['chat']['threads'][':id']['slug-status']['$get'];
export type GetThreadSlugStatusRequest = InferRequestType<GetThreadSlugStatusEndpoint>;
export type GetThreadSlugStatusResponse = InferResponseType<GetThreadSlugStatusEndpoint>;

// ============================================================================
// Type Inference - Messages and Changelog
// ============================================================================

type GetThreadMessagesEndpoint = ApiClientType['chat']['threads'][':id']['messages']['$get'];
export type GetThreadMessagesRequest = InferRequestType<GetThreadMessagesEndpoint>;
export type GetThreadMessagesResponse = InferResponseType<GetThreadMessagesEndpoint>;

type GetThreadChangelogEndpoint = ApiClientType['chat']['threads'][':id']['changelog']['$get'];
export type GetThreadChangelogRequest = InferRequestType<GetThreadChangelogEndpoint>;
export type GetThreadChangelogResponse = InferResponseType<GetThreadChangelogEndpoint>;

type GetThreadRoundChangelogEndpoint = ApiClientType['chat']['threads'][':threadId']['rounds'][':roundNumber']['changelog']['$get'];
export type GetThreadRoundChangelogRequest = InferRequestType<GetThreadRoundChangelogEndpoint>;
export type GetThreadRoundChangelogResponse = InferResponseType<GetThreadRoundChangelogEndpoint>;

// ============================================================================
// Type Inference - Stream Resumption
// ============================================================================

type GetThreadStreamResumptionStateEndpoint = ApiClientType['chat']['threads'][':threadId']['stream-status']['$get'];
export type GetThreadStreamResumptionStateRequest = InferRequestType<GetThreadStreamResumptionStateEndpoint>;
export type GetThreadStreamResumptionStateResponse = InferResponseType<GetThreadStreamResumptionStateEndpoint>;

// ============================================================================
// Service Functions - Thread CRUD
// ============================================================================

/**
 * List chat threads with cursor pagination
 * Protected endpoint - requires authentication
 */
export async function listThreadsService(args?: ListThreadsRequest, options?: { cookieHeader?: string }) {
  const client = createApiClient({ cookieHeader: options?.cookieHeader });
  return parseResponse(client.chat.threads.$get(args ?? { query: {} }));
}

// ============================================================================
// Type Inference - Sidebar Thread Operations
// ============================================================================

type ListSidebarThreadsEndpoint = ApiClientType['chat']['threads']['sidebar']['$get'];
export type ListSidebarThreadsRequest = InferRequestType<ListSidebarThreadsEndpoint>;
export type ListSidebarThreadsResponse = InferResponseType<ListSidebarThreadsEndpoint>;

/**
 * List sidebar threads with lightweight payload (essential fields only)
 * Protected endpoint - requires authentication
 */
export async function listSidebarThreadsService(
  args?: ListSidebarThreadsRequest,
  options?: { cookieHeader?: string },
) {
  const client = createApiClient({ cookieHeader: options?.cookieHeader });
  return parseResponse(client.chat.threads.sidebar.$get(args ?? { query: {} }));
}

/**
 * Create a new chat thread with participants and optional first message
 * Protected endpoint - requires authentication
 */
export async function createThreadService(data: CreateThreadRequest) {
  const client = createApiClient();
  return parseResponse(client.chat.threads.$post(data));
}

/**
 * Get a specific thread by ID with participants and messages
 * Protected endpoint - requires authentication (ownership check)
 */
export async function getThreadService(data: GetThreadRequest) {
  const client = createApiClient();
  return parseResponse(client.chat.threads[':id'].$get(data));
}

/**
 * Update thread details (title, favorite, public status, etc.)
 * Protected endpoint - requires authentication
 */
export async function updateThreadService(data: UpdateThreadRequest) {
  const client = createApiClient();
  return parseResponse(client.chat.threads[':id'].$patch(data));
}

/**
 * Delete a chat thread
 * Protected endpoint - requires authentication
 */
export async function deleteThreadService(data: DeleteThreadRequest) {
  const client = createApiClient();
  return parseResponse(client.chat.threads[':id'].$delete(data));
}

// ============================================================================
// Service Functions - Public Thread Operations
// ============================================================================

/**
 * Get a public thread by slug (no authentication required)
 * Public endpoint - uses createPublicApiClient() for ISR/SSG compatibility
 */
export async function getPublicThreadService(data: GetPublicThreadRequest) {
  const client = createPublicApiClient();
  return parseResponse(client.chat.public[':slug'].$get(data));
}

/**
 * List all public thread slugs for SSG/ISR page generation
 * Public endpoint - uses createPublicApiClient() for ISR/SSG compatibility
 */
export async function listPublicThreadSlugsService() {
  const client = createPublicApiClient();
  return parseResponse(client.chat.public.slugs.$get());
}

/**
 * Get a thread by slug for the authenticated user
 * Protected endpoint - requires authentication (ownership check)
 */
export async function getThreadBySlugService(data: GetThreadBySlugRequest) {
  const client = createApiClient();
  return parseResponse(client.chat.threads.slug[':slug'].$get(data));
}

/**
 * Get thread slug status (for polling during AI title generation)
 * Protected endpoint - requires authentication (ownership check)
 */
export async function getThreadSlugStatusService(data: GetThreadSlugStatusRequest) {
  const client = createApiClient();
  return parseResponse(client.chat.threads[':id']['slug-status'].$get(data));
}

// ============================================================================
// Service Functions - Messages and Changelog
// ============================================================================

/**
 * Get messages for a thread
 * Protected endpoint - requires authentication (ownership check)
 */
export async function getThreadMessagesService(data: GetThreadMessagesRequest) {
  const client = createApiClient();
  return parseResponse(client.chat.threads[':id'].messages.$get(data));
}

/**
 * Get configuration changelog for a thread
 * Protected endpoint - requires authentication (ownership check)
 */
export async function getThreadChangelogService(
  data: GetThreadChangelogRequest,
  options?: { cookieHeader?: string },
) {
  const client = createApiClient({ cookieHeader: options?.cookieHeader });
  return parseResponse(client.chat.threads[':id'].changelog.$get(data));
}

/**
 * Get configuration changelog for a specific round
 * Protected endpoint - requires authentication (ownership check)
 */
export async function getThreadRoundChangelogService(data: GetThreadRoundChangelogRequest) {
  const client = createApiClient();
  return parseResponse(client.chat.threads[':threadId'].rounds[':roundNumber'].changelog.$get(data));
}

// ============================================================================
// Service Functions - Stream Resumption
// ============================================================================

/**
 * Get stream resumption state for server-side prefetching
 * Protected endpoint - requires authentication (ownership check)
 */
export async function getThreadStreamResumptionStateService(data: GetThreadStreamResumptionStateRequest) {
  const client = createApiClient();
  return parseResponse(client.chat.threads[':threadId']['stream-status'].$get(data));
}

// ============================================================================
// Type Inference - Auto Mode Prompt Analysis
// ============================================================================

type AnalyzePromptEndpoint = ApiClientType['chat']['analyze']['$post'];
export type AnalyzePromptRequest = InferRequestType<AnalyzePromptEndpoint>;
export type AnalyzePromptResponse = InferResponseType<AnalyzePromptEndpoint>;

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
  const client = createApiClient();
  return client.chat.analyze.$post(data);
}

// ============================================================================
// Type Extractions - Derived from API Response Types (SINGLE SOURCE OF TRUTH)
// ============================================================================

/**
 * Thread detail payload data extracted from GetThreadResponse
 * Contains: thread, participants, messages, changelog, feedback, preSearches, user
 *
 * Uses Extract to get the { success: true } variant and then access 'data'.
 */
export type ThreadDetailData = Extract<GetThreadResponse, { success: true }> extends { data: infer D } ? D : never;

/**
 * Public thread payload data extracted from GetPublicThreadResponse
 * Same structure as ThreadDetailData but from public endpoint
 */
export type PublicThreadData = Extract<GetPublicThreadResponse, { success: true }> extends { data: infer D } ? D : never;

/**
 * Message type from API response - derived from ThreadDetailData
 * Use this for any function that processes API messages
 */
export type ApiMessage = ThreadDetailData['messages'][number];

/**
 * Changelog type from API response - derived from ThreadDetailData
 * Use this for any function that processes API changelog items
 */
export type ApiChangelog = ThreadDetailData['changelog'][number];

/**
 * Participant type from API response - derived from ThreadDetailData
 */
export type ApiParticipant = ThreadDetailData['participants'][number];

/**
 * Changelog list payload data extracted from GetThreadChangelogResponse
 * SINGLE SOURCE OF TRUTH for changelog list operations
 */
export type ChangelogListData = Extract<GetThreadChangelogResponse, { success: true }> extends { data: infer D } ? D : never;

/**
 * Individual changelog item from changelog list endpoint
 * This should be identical to ApiChangelog from thread detail
 */
export type ChangelogItem = ChangelogListData['items'][number];
