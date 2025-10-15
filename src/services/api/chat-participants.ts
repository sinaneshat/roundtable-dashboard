/**
 * Chat Participants Service - Participant Management API
 *
 * 100% type-safe RPC service for chat participant operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/api/client';
import { createApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

export type AddParticipantRequest = InferRequestType<
  ApiClientType['chat']['threads'][':id']['participants']['$post']
>;

export type AddParticipantResponse = InferResponseType<
  ApiClientType['chat']['threads'][':id']['participants']['$post']
>;

export type UpdateParticipantRequest = InferRequestType<
  ApiClientType['chat']['participants'][':id']['$patch']
>;

export type UpdateParticipantResponse = InferResponseType<
  ApiClientType['chat']['participants'][':id']['$patch']
>;

export type DeleteParticipantRequest = InferRequestType<
  ApiClientType['chat']['participants'][':id']['$delete']
>;

export type DeleteParticipantResponse = InferResponseType<
  ApiClientType['chat']['participants'][':id']['$delete']
>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Add a participant (AI model) to a thread
 * Protected endpoint - requires authentication
 *
 * @param data - Request with param.id (thread ID) and json (participant data)
 */
export async function addParticipantService(data: AddParticipantRequest) {
  const client = await createApiClient();
  // Internal fallback: ensure param and json exist
  const params: AddParticipantRequest = {
    param: data.param ?? { id: '' },
    json: data.json ?? {},
  };
  return parseResponse(client.chat.threads[':id'].participants.$post(params));
}

/**
 * Update participant settings
 * Protected endpoint - requires authentication
 *
 * @param data - Request with param.id (participant ID) and json (update data)
 */
export async function updateParticipantService(data: UpdateParticipantRequest) {
  const client = await createApiClient();
  // Internal fallback: ensure param and json exist
  const params: UpdateParticipantRequest = {
    param: data.param ?? { id: '' },
    json: data.json ?? {},
  };
  return parseResponse(client.chat.participants[':id'].$patch(params));
}

/**
 * Remove a participant from a thread
 * Protected endpoint - requires authentication
 *
 * @param data - Request with param.id for participant ID
 */
export async function deleteParticipantService(data: DeleteParticipantRequest) {
  const client = await createApiClient();
  // Internal fallback: ensure param exists
  const params: DeleteParticipantRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.chat.participants[':id'].$delete(params));
}
