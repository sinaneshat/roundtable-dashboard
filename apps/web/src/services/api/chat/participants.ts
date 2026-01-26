/**
 * Chat Participants Service - Participant Management API
 *
 * 100% type-safe RPC service for chat participant operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/lib/api/client';
import { createApiClient } from '@/lib/api/client';

// ============================================================================
// Type Inference
// ============================================================================

type AddParticipantEndpoint = ApiClientType['chatMessage']['chat']['threads'][':id']['participants']['$post'];
export type AddParticipantRequest = InferRequestType<AddParticipantEndpoint>;
export type AddParticipantResponse = InferResponseType<AddParticipantEndpoint, 200>;

type UpdateParticipantEndpoint = ApiClientType['chatMessage']['chat']['participants'][':id']['$patch'];
export type UpdateParticipantRequest = InferRequestType<UpdateParticipantEndpoint>;
export type UpdateParticipantResponse = InferResponseType<UpdateParticipantEndpoint, 200>;

type DeleteParticipantEndpoint = ApiClientType['chatMessage']['chat']['participants'][':id']['$delete'];
export type DeleteParticipantRequest = InferRequestType<DeleteParticipantEndpoint>;
export type DeleteParticipantResponse = InferResponseType<DeleteParticipantEndpoint, 200>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Add a participant (AI model) to a thread
 * Protected endpoint - requires authentication
 */
export async function addParticipantService(data: AddParticipantRequest) {
  const client = createApiClient();
  return parseResponse(client.chatMessage.chat.threads[':id'].participants.$post(data));
}

/**
 * Update participant settings
 * Protected endpoint - requires authentication
 */
export async function updateParticipantService(data: UpdateParticipantRequest) {
  const client = createApiClient();
  return parseResponse(client.chatMessage.chat.participants[':id'].$patch(data));
}

/**
 * Remove a participant from a thread
 * Protected endpoint - requires authentication
 */
export async function deleteParticipantService(data: DeleteParticipantRequest) {
  const client = createApiClient();
  return parseResponse(client.chatMessage.chat.participants[':id'].$delete(data));
}
