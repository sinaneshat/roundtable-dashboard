/**
 * Message Metadata Schemas
 *
 * Shared metadata schemas for messages across backend and frontend.
 * All messages MUST have roundNumber - it's the primary grouping key.
 */

import { z } from 'zod';

// ============================================================================
// Base Message Metadata Schema (Shared Fields)
// ============================================================================

const BaseMessageMetadataFields = {
  // AI SDK core fields
  model: z.string().optional(),
  finishReason: z.string().optional(),
  usage: z.object({
    promptTokens: z.number().optional(),
    completionTokens: z.number().optional(),
    totalTokens: z.number().optional(),
  }).optional(),

  // Participant context fields
  participantId: z.string().optional(),
  participantIndex: z.number().optional(),
  participantRole: z.string().nullable().optional(),
  roundNumber: z.number().int().positive(), // REQUIRED: All messages belong to a round

  // Error handling fields
  hasError: z.boolean().optional(),
  errorType: z.string().optional(),
  errorMessage: z.string().optional(),
  errorCategory: z.string().optional(),
  isTransient: z.boolean().optional(),
};

export const BaseMessageMetadataSchema = z.object(BaseMessageMetadataFields).passthrough().nullable();

export type BaseMessageMetadata = z.infer<typeof BaseMessageMetadataSchema>;

// ============================================================================
// Backend Storage Metadata Schema (Database)
// ============================================================================

export const MessageMetadataSchema = z.object({
  ...BaseMessageMetadataFields,
  providerMessage: z.string().optional(),
  openRouterError: z.record(z.string(), z.unknown()).optional(),
  retryAttempts: z.number().optional(),
  isEmptyResponse: z.boolean().optional(),
}).passthrough().nullable();

export type MessageMetadata = z.infer<typeof MessageMetadataSchema>;

// ============================================================================
// Frontend UI Metadata Schema
// ============================================================================

export const UIMessageMetadataSchema = z.object({
  ...BaseMessageMetadataFields,
  createdAt: z.string().datetime().optional(),
  mode: z.string().optional(),
  aborted: z.boolean().optional(),
  partialResponse: z.boolean().optional(),
  statusCode: z.number().optional(),
  responseBody: z.string().optional(),
  errorDetails: z.string().optional(),
  isEmptyResponse: z.boolean().optional(),
  role: z.string().nullable().optional(),
  error: z.string().optional(),
}).passthrough().nullable().optional();

export type UIMessageMetadata = z.infer<typeof UIMessageMetadataSchema>;

// ============================================================================
// Helpers
// ============================================================================

export function messageHasError(metadata: MessageMetadata | UIMessageMetadata | null | undefined): boolean {
  return metadata?.hasError === true;
}

export function toUIMetadata(metadata: MessageMetadata | null | undefined): UIMessageMetadata {
  if (!metadata)
    return null;

  return {
    ...metadata,
    role: metadata.participantRole,
    error: metadata.errorMessage,
  };
}
