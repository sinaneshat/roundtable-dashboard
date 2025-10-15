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
// Type Inference - Automatically derived from backend routes
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

export type GetPublicThreadRequest = InferRequestType<
  ApiClientType['chat']['public'][':slug']['$get']
>;

export type GetPublicThreadResponse = InferResponseType<
  ApiClientType['chat']['public'][':slug']['$get']
>;

export type GetThreadBySlugRequest = InferRequestType<
  ApiClientType['chat']['threads']['slug'][':slug']['$get']
>;

export type GetThreadBySlugResponse = InferResponseType<
  ApiClientType['chat']['threads']['slug'][':slug']['$get']
>;

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

export type GetThreadAnalysesRequest = InferRequestType<
  ApiClientType['chat']['threads'][':id']['analyses']['$get']
>;

export type GetThreadAnalysesResponse = InferResponseType<
  ApiClientType['chat']['threads'][':id']['analyses']['$get']
>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * List chat threads with cursor pagination
 * Protected endpoint - requires authentication
 *
 * CRITICAL: Consistent argument handling for SSR/hydration
 * Only pass args if defined to ensure server/client consistency
 */
export async function listThreadsService(args?: ListThreadsRequest) {
  const client = await createApiClient();
  // Internal fallback: if args not provided, create proper empty query object
  const params: ListThreadsRequest = {
    query: args?.query ?? {},
  };
  return parseResponse(client.chat.threads.$get(params));
}

/**
 * Create a new chat thread with participants and optional first message
 * Protected endpoint - requires authentication
 *
 * @param data - Thread creation data including title, participants, mode, and optional first message
 */
export async function createThreadService(data: CreateThreadRequest) {
  const client = await createApiClient();
  // Internal fallback: ensure json property exists
  const params: CreateThreadRequest = {
    json: data.json ?? {},
  };
  return parseResponse(client.chat.threads.$post(params));
}

/**
 * Get a specific thread by ID with participants and messages
 * Protected endpoint - requires authentication (ownership check)
 *
 * @param data - Request with param.id for thread ID
 */
export async function getThreadService(data: GetThreadRequest) {
  const client = await createApiClient();
  // Internal fallback: ensure param exists
  const params: GetThreadRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.chat.threads[':id'].$get(params));
}

/**
 * Update thread details (title, favorite, public status, etc.)
 * Protected endpoint - requires authentication
 *
 * @param data - Request with param.id and json body
 */
export async function updateThreadService(data: UpdateThreadRequest) {
  const client = await createApiClient();
  // Internal fallback: ensure param and json exist
  const params: UpdateThreadRequest = {
    param: data.param ?? { id: '' },
    json: data.json ?? {},
  };
  return parseResponse(client.chat.threads[':id'].$patch(params));
}

/**
 * Delete a chat thread
 * Protected endpoint - requires authentication
 *
 * @param data - Request with param.id for thread ID
 */
export async function deleteThreadService(data: DeleteThreadRequest) {
  const client = await createApiClient();
  // Internal fallback: ensure param exists
  const params: DeleteThreadRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.chat.threads[':id'].$delete(params));
}

/**
 * Get a public thread by slug (no authentication required)
 * Public endpoint - no authentication required
 *
 * IMPORTANT: Uses createPublicApiClient() instead of createApiClient()
 * to avoid accessing cookies, which would break ISR/SSG rendering.
 *
 * @param data - Request with param.slug for thread slug
 */
export async function getPublicThreadService(data: GetPublicThreadRequest) {
  const client = await createPublicApiClient();
  // Internal fallback: ensure param exists
  const params: GetPublicThreadRequest = {
    param: data.param ?? { slug: '' },
  };
  return parseResponse(client.chat.public[':slug'].$get(params));
}

/**
 * Get a thread by slug for the authenticated user
 * Protected endpoint - requires authentication (ownership check)
 *
 * @param data - Request with param.slug for thread slug
 */
export async function getThreadBySlugService(data: GetThreadBySlugRequest) {
  const client = await createApiClient();
  // Internal fallback: ensure param exists
  const params: GetThreadBySlugRequest = {
    param: data.param ?? { slug: '' },
  };
  return parseResponse(client.chat.threads.slug[':slug'].$get(params));
}

/**
 * Get messages for a thread
 * Protected endpoint - requires authentication (ownership check)
 *
 * Returns all messages for a thread ordered by creation time.
 *
 * @param data - Request with param.id for thread ID
 */
export async function getThreadMessagesService(data: GetThreadMessagesRequest) {
  const client = await createApiClient();
  // Internal fallback: ensure param exists
  const params: GetThreadMessagesRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.chat.threads[':id'].messages.$get(params));
}

/**
 * Get configuration changelog for a thread
 * Protected endpoint - requires authentication (ownership check)
 *
 * Returns configuration changes (mode, participants, memories) ordered by creation time (newest first).
 *
 * @param data - Request with param.id for thread ID
 */
export async function getThreadChangelogService(data: GetThreadChangelogRequest) {
  const client = await createApiClient();
  // Internal fallback: ensure param exists
  const params: GetThreadChangelogRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.chat.threads[':id'].changelog.$get(params));
}

/**
 * Get moderator analyses for a thread
 * Protected endpoint - requires authentication (ownership check)
 *
 * Returns all moderator analyses for a thread ordered by round number.
 *
 * @param data - Request with param.id for thread ID
 */
export async function getThreadAnalysesService(data: GetThreadAnalysesRequest) {
  const client = await createApiClient();
  // Internal fallback: ensure param exists
  const params: GetThreadAnalysesRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.chat.threads[':id'].analyses.$get(params));
}
