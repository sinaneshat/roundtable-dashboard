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

// ============================================================================
// Type Aliases - For convenience
// ============================================================================

/**
 * Thread mode type (matches database enum)
 */
export type ThreadMode = 'analyzing' | 'brainstorming' | 'debating' | 'solving';

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
  return parseResponse(client.chat.threads.$get(args || { query: {} }));
}

/**
 * Create a new chat thread with participants and optional first message
 * Protected endpoint - requires authentication
 *
 * @param data - Thread creation data including title, participants, mode, and optional first message
 */
export async function createThreadService(data: CreateThreadRequest) {
  const client = await createApiClient();
  return parseResponse(client.chat.threads.$post(data));
}

/**
 * Get a specific thread by ID with participants and messages
 * Protected endpoint - requires authentication (ownership check)
 *
 * @param threadId - Thread ID
 */
export async function getThreadService(threadId: string) {
  const client = await createApiClient();
  return parseResponse(
    client.chat.threads[':id'].$get({
      param: { id: threadId },
    }),
  );
}

/**
 * Update thread details (title, favorite, public status, etc.)
 * Protected endpoint - requires authentication
 *
 * @param threadId - Thread ID
 * @param data - Thread update data
 */
export async function updateThreadService(
  threadId: string,
  data: Omit<UpdateThreadRequest, 'param'>,
) {
  const client = await createApiClient();
  return parseResponse(
    client.chat.threads[':id'].$patch({
      param: { id: threadId },
      ...data,
    }),
  );
}

/**
 * Delete a chat thread
 * Protected endpoint - requires authentication
 *
 * @param threadId - Thread ID
 */
export async function deleteThreadService(threadId: string) {
  const client = await createApiClient();
  return parseResponse(
    client.chat.threads[':id'].$delete({
      param: { id: threadId },
    }),
  );
}

/**
 * Get a public thread by slug (no authentication required)
 * Public endpoint - no authentication required
 *
 * IMPORTANT: Uses createPublicApiClient() instead of createApiClient()
 * to avoid accessing cookies, which would break ISR/SSG rendering.
 *
 * @param slug - Thread slug
 */
export async function getPublicThreadService(slug: string) {
  const client = createPublicApiClient();
  return parseResponse(
    client.chat.public[':slug'].$get({
      param: { slug },
    }),
  );
}

/**
 * Get a thread by slug for the authenticated user
 * Protected endpoint - requires authentication (ownership check)
 *
 * @param slug - Thread slug
 */
export async function getThreadBySlugService(slug: string) {
  const client = await createApiClient();
  return parseResponse(
    client.chat.threads.slug[':slug'].$get({
      param: { slug },
    }),
  );
}
