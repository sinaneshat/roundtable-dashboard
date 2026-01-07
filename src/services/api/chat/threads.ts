/**
 * Chat Threads Service - Thread Management API
 *
 * 100% type-safe RPC service for chat thread operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/api/client';
import { createApiClient, createPublicApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Thread Operations
// ============================================================================

export type ListThreadsRequest = InferRequestType<
  ApiClientType['chat']['threads']['$get']
>;

export type ListThreadsResponse = InferResponseType<
  ApiClientType['chat']['threads']['$get']
>;

export type CreateThreadRequest = InferRequestType<
  ApiClientType['chat']['threads']['$post']
>;

export type CreateThreadResponse = InferResponseType<
  ApiClientType['chat']['threads']['$post']
>;

export type GetThreadRequest = InferRequestType<
  ApiClientType['chat']['threads'][':id']['$get']
>;

export type GetThreadResponse = InferResponseType<
  ApiClientType['chat']['threads'][':id']['$get']
>;

export type UpdateThreadRequest = InferRequestType<
  ApiClientType['chat']['threads'][':id']['$patch']
>;

export type UpdateThreadResponse = InferResponseType<
  ApiClientType['chat']['threads'][':id']['$patch']
>;

export type DeleteThreadRequest = InferRequestType<
  ApiClientType['chat']['threads'][':id']['$delete']
>;

export type DeleteThreadResponse = InferResponseType<
  ApiClientType['chat']['threads'][':id']['$delete']
>;

// ============================================================================
// Type Inference - Public Thread Operations
// ============================================================================

export type GetPublicThreadRequest = InferRequestType<
  ApiClientType['chat']['public'][':slug']['$get']
>;

export type GetPublicThreadResponse = InferResponseType<
  ApiClientType['chat']['public'][':slug']['$get']
>;

export type ListPublicThreadSlugsResponse = InferResponseType<
  ApiClientType['chat']['public']['slugs']['$get']
>;

export type GetThreadBySlugRequest = InferRequestType<
  ApiClientType['chat']['threads']['slug'][':slug']['$get']
>;

export type GetThreadBySlugResponse = InferResponseType<
  ApiClientType['chat']['threads']['slug'][':slug']['$get']
>;

export type GetThreadSlugStatusRequest = InferRequestType<
  ApiClientType['chat']['threads'][':id']['slug-status']['$get']
>;

export type GetThreadSlugStatusResponse = InferResponseType<
  ApiClientType['chat']['threads'][':id']['slug-status']['$get']
>;

// ============================================================================
// Type Inference - Messages and Changelog
// ============================================================================

export type GetThreadMessagesRequest = InferRequestType<
  ApiClientType['chat']['threads'][':id']['messages']['$get']
>;

export type GetThreadMessagesResponse = InferResponseType<
  ApiClientType['chat']['threads'][':id']['messages']['$get']
>;

export type GetThreadChangelogRequest = InferRequestType<
  ApiClientType['chat']['threads'][':id']['changelog']['$get']
>;

export type GetThreadChangelogResponse = InferResponseType<
  ApiClientType['chat']['threads'][':id']['changelog']['$get']
>;

export type GetThreadRoundChangelogRequest = InferRequestType<
  ApiClientType['chat']['threads'][':threadId']['rounds'][':roundNumber']['changelog']['$get']
>;

export type GetThreadRoundChangelogResponse = InferResponseType<
  ApiClientType['chat']['threads'][':threadId']['rounds'][':roundNumber']['changelog']['$get']
>;

// ============================================================================
// Type Inference - Round Operations
// ============================================================================

export type SummarizeRoundRequest = InferRequestType<
  ApiClientType['chat']['threads'][':threadId']['rounds'][':roundNumber']['moderator']['$post']
>;

export type SummarizeRoundResponse = InferResponseType<
  ApiClientType['chat']['threads'][':threadId']['rounds'][':roundNumber']['moderator']['$post']
>;

// ============================================================================
// Type Inference - Stream Resumption
// ============================================================================

export type GetThreadStreamResumptionStateRequest = InferRequestType<
  ApiClientType['chat']['threads'][':threadId']['stream-status']['$get']
>;

export type GetThreadStreamResumptionStateResponse = InferResponseType<
  ApiClientType['chat']['threads'][':threadId']['stream-status']['$get']
>;

// ============================================================================
// Service Functions - Thread CRUD
// ============================================================================

/**
 * List chat threads with cursor pagination
 * Protected endpoint - requires authentication
 */
export async function listThreadsService(args?: ListThreadsRequest) {
  const client = await createApiClient();
  const params: ListThreadsRequest = {
    query: args?.query ?? {},
  };
  return parseResponse(client.chat.threads.$get(params));
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
export async function getThreadBySlugService(data: GetThreadBySlugRequest) {
  const client = await createApiClient();
  const params: GetThreadBySlugRequest = {
    param: data.param ?? { slug: '' },
  };
  return parseResponse(client.chat.threads.slug[':slug'].$get(params));
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
 */
export async function getThreadChangelogService(data: GetThreadChangelogRequest) {
  const client = await createApiClient();
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
