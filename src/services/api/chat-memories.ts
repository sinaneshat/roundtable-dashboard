/**
 * Chat Memories Service - Memory Management API
 *
 * 100% type-safe RPC service for chat memory/preset operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/api/client';
import { createApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

export type ListMemoriesRequest = InferRequestType<
  ApiClientType['chat']['memories']['$get']
>;

export type ListMemoriesResponse = InferResponseType<
  ApiClientType['chat']['memories']['$get']
>;

export type CreateMemoryRequest = InferRequestType<
  ApiClientType['chat']['memories']['$post']
>;

export type CreateMemoryResponse = InferResponseType<
  ApiClientType['chat']['memories']['$post']
>;

export type GetMemoryRequest = InferRequestType<
  ApiClientType['chat']['memories'][':id']['$get']
>;

export type GetMemoryResponse = InferResponseType<
  ApiClientType['chat']['memories'][':id']['$get']
>;

export type UpdateMemoryRequest = InferRequestType<
  ApiClientType['chat']['memories'][':id']['$patch']
>;

export type UpdateMemoryResponse = InferResponseType<
  ApiClientType['chat']['memories'][':id']['$patch']
>;

export type DeleteMemoryRequest = InferRequestType<
  ApiClientType['chat']['memories'][':id']['$delete']
>;

export type DeleteMemoryResponse = InferResponseType<
  ApiClientType['chat']['memories'][':id']['$delete']
>;

// ============================================================================
// Type Aliases - For convenience
// ============================================================================

/**
 * Memory type enum (matches database)
 */
export type MemoryType = 'personal' | 'topic' | 'instruction' | 'fact';

// ============================================================================
// Service Functions
// ============================================================================

/**
 * List user memories with cursor pagination
 * Protected endpoint - requires authentication
 *
 * CRITICAL: Consistent argument handling for SSR/hydration
 * Only pass args if defined to ensure server/client consistency
 */
export async function listMemoriesService(args?: ListMemoriesRequest) {
  const client = await createApiClient();
  return parseResponse(client.chat.memories.$get(args || { query: {} }));
}

/**
 * Create a new memory/preset
 * Protected endpoint - requires authentication
 *
 * @param data - Memory data including title, content, tags, and isShared flag
 */
export async function createMemoryService(data: CreateMemoryRequest) {
  const client = await createApiClient();
  return parseResponse(client.chat.memories.$post(data));
}

/**
 * Get a specific memory by ID
 * Protected endpoint - requires authentication
 *
 * @param memoryId - Memory ID
 */
export async function getMemoryService(memoryId: string) {
  const client = await createApiClient();
  return parseResponse(
    client.chat.memories[':id'].$get({
      param: { id: memoryId },
    }),
  );
}

/**
 * Update memory details
 * Protected endpoint - requires authentication
 *
 * @param memoryId - Memory ID
 * @param data - Memory update data
 */
export async function updateMemoryService(
  memoryId: string,
  data: Omit<UpdateMemoryRequest, 'param'>,
) {
  const client = await createApiClient();
  return parseResponse(
    client.chat.memories[':id'].$patch({
      param: { id: memoryId },
      ...data,
    }),
  );
}

/**
 * Delete a memory
 * Protected endpoint - requires authentication
 *
 * @param memoryId - Memory ID
 */
export async function deleteMemoryService(memoryId: string) {
  const client = await createApiClient();
  return parseResponse(
    client.chat.memories[':id'].$delete({
      param: { id: memoryId },
    }),
  );
}
