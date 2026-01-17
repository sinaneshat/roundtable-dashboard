/**
 * Chat Participants Service - Participant Management API
 *
 * 100% type-safe RPC service for chat participant operations
 * All types automatically inferred from backend Hono routes
 */

import { parseResponse } from 'hono/client';

import { createApiClient } from '@/api/client';

// ============================================================================
// Type Inference - Automatically derived from backend routes
// ============================================================================

export type AddParticipantRequest = any;

export type AddParticipantResponse = any;

export type UpdateParticipantRequest = any;

export type UpdateParticipantResponse = any;

export type DeleteParticipantRequest = any;

export type DeleteParticipantResponse = any;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Add a participant (AI model) to a thread
 * Protected endpoint - requires authentication
 */
export async function addParticipantService(data: AddParticipantRequest) {
  const client = await createApiClient();
  const params: AddParticipantRequest = {
    param: data.param ?? { id: '' },
    json: data.json ?? {},
  };
  return parseResponse(client.chat.threads[':id'].participants.$post(params));
}

/**
 * Update participant settings
 * Protected endpoint - requires authentication
 */
export async function updateParticipantService(data: UpdateParticipantRequest) {
  const client = await createApiClient();
  const params: UpdateParticipantRequest = {
    param: data.param ?? { id: '' },
    json: data.json ?? {},
  };
  return parseResponse(client.chat.participants[':id'].$patch(params));
}

/**
 * Remove a participant from a thread
 * Protected endpoint - requires authentication
 */
export async function deleteParticipantService(data: DeleteParticipantRequest) {
  const client = await createApiClient();
  const params: DeleteParticipantRequest = {
    param: data.param ?? { id: '' },
  };
  return parseResponse(client.chat.participants[':id'].$delete(params));
}
