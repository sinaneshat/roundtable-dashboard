/**
 * Message Metadata Schemas
 *
 * ✅ SINGLE SOURCE OF TRUTH: Shared metadata for messages
 *
 * Consolidates message metadata used by:
 * - Backend storage (MessageMetadataSchema) - complete set for database
 * - Frontend UI (UIMessageMetadataSchema) - UI-specific fields
 * - AI SDK integration - token usage, finish reason, etc.
 *
 * Pattern: Base schema with shared fields, extended for specific use cases.
 *
 * @see /REFACTORING_PLAN.md - Phase 1, Task 1.3
 */

import { z } from 'zod';

// ============================================================================
// Base Message Metadata Schema (Shared Fields)
// ============================================================================

/**
 * ✅ BASE METADATA: Core fields shared between backend storage and frontend UI
 *
 * Contains:
 * - AI SDK core fields (model, finishReason, usage)
 * - Participant context (participantId, participantIndex, participantRole, roundNumber)
 * - Error state (hasError, errorType, errorMessage, errorCategory, isTransient)
 */
const BaseMessageMetadataFields = {
  // ✅ Core AI SDK fields
  model: z.string().optional(),
  finishReason: z.string().optional(),
  usage: z.object({
    promptTokens: z.number().optional(),
    completionTokens: z.number().optional(),
    totalTokens: z.number().optional(),
  }).optional(),

  // ✅ Participant context fields
  participantId: z.string().optional(),
  participantIndex: z.number().optional(),
  participantRole: z.string().optional(),
  roundNumber: z.number().optional(),

  // ✅ Error handling fields (shared between backend and frontend)
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

/**
 * ✅ BACKEND STORAGE: Complete metadata for database persistence
 *
 * Extends BaseMessageMetadata with:
 * - Provider-specific fields (providerMessage, openRouterError)
 * - Retry tracking (retryAttempts)
 * - Response state flags (isEmptyResponse)
 */
export const MessageMetadataSchema = z.object({
  ...BaseMessageMetadataFields,

  // ✅ Provider-specific error details
  providerMessage: z.string().optional(),
  openRouterError: z.record(z.string(), z.unknown()).optional(),

  // ✅ Retry tracking
  retryAttempts: z.number().optional(),

  // ✅ Response state flags
  isEmptyResponse: z.boolean().optional(),
}).passthrough().nullable();

export type MessageMetadata = z.infer<typeof MessageMetadataSchema>;

// ============================================================================
// Frontend UI Metadata Schema
// ============================================================================

/**
 * ✅ FRONTEND UI: UI-specific metadata for rendering and interaction
 *
 * Extends BaseMessageMetadata with:
 * - UI-specific fields (createdAt, mode, aborted, partialResponse)
 * - HTTP response details (statusCode, responseBody, errorDetails)
 * - Response state flags (isEmptyResponse)
 *
 * Note: participantRole is mapped to 'role' for UI compatibility
 */
export const UIMessageMetadataSchema = z.object({
  ...BaseMessageMetadataFields,

  // ✅ UI-specific fields
  createdAt: z.string().datetime().optional(),
  mode: z.string().optional(),
  aborted: z.boolean().optional(),
  partialResponse: z.boolean().optional(),

  // ✅ HTTP response details (for error rendering)
  statusCode: z.number().optional(),
  responseBody: z.string().optional(),
  errorDetails: z.string().optional(),

  // ✅ Response state flags
  isEmptyResponse: z.boolean().optional(),

  // ✅ UI compatibility: 'role' alias for participantRole
  role: z.string().nullable().optional(),

  // ✅ UI compatibility: 'error' alias for errorMessage
  error: z.string().optional(),
}).passthrough().nullable().optional();

export type UIMessageMetadata = z.infer<typeof UIMessageMetadataSchema>;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * ✅ TYPE GUARD: Check if a message has an error
 * Safe utility function to check message error status without type assertions
 */
export function messageHasError(metadata: MessageMetadata | UIMessageMetadata | null | undefined): boolean {
  return metadata?.hasError === true;
}

// ============================================================================
// Conversion Helpers
// ============================================================================

/**
 * ✅ CONVERSION HELPER: Convert backend metadata to UI metadata
 *
 * Maps backend storage metadata fields to UI-compatible format:
 * - Copies all shared fields (model, finishReason, usage, participant context, error state)
 * - Maps participantRole → role for UI compatibility
 * - Maps errorMessage → error for UI compatibility
 * - Preserves all UI-specific fields if present
 *
 * @param metadata - Backend message metadata from database
 * @returns UI-compatible metadata for frontend rendering
 */
export function toUIMetadata(metadata: MessageMetadata | null | undefined): UIMessageMetadata {
  if (!metadata) {
    return null;
  }

  return {
    // ✅ Core AI SDK fields
    model: metadata.model,
    finishReason: metadata.finishReason,
    usage: metadata.usage,

    // ✅ Participant context fields
    participantId: metadata.participantId,
    participantIndex: metadata.participantIndex,
    participantRole: metadata.participantRole,
    role: metadata.participantRole, // UI alias
    roundNumber: metadata.roundNumber,

    // ✅ Error handling fields
    hasError: metadata.hasError,
    errorType: metadata.errorType,
    errorMessage: metadata.errorMessage,
    error: metadata.errorMessage, // UI alias
    errorCategory: metadata.errorCategory,
    isTransient: metadata.isTransient,

    // ✅ Response state flags
    isEmptyResponse: metadata.isEmptyResponse,

    // ✅ Passthrough any additional fields (preserves UI-specific fields if present)
    ...(metadata as Record<string, unknown>),
  };
}
