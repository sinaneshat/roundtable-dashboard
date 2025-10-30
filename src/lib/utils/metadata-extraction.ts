/**
 * Message Metadata Extraction Utilities
 *
 * **SINGLE SOURCE OF TRUTH**: Type-safe extraction of metadata fields from UIMessages.
 * Prevents unsafe type assertions and centralizes metadata access patterns.
 *
 * Following backend-patterns.md: Zod-based validation and type safety first.
 *
 * @module lib/utils/metadata-extraction
 */

import type { UIMessage } from 'ai';

import { MessageMetadataSchema } from '@/lib/schemas/message-metadata';

/**
 * Extract round number from message metadata (type-safe)
 *
 * **SINGLE SOURCE OF TRUTH**: Use this instead of:
 * - `metadata?.roundNumber as number`
 * - `(metadata as Record<string, unknown>)?.roundNumber`
 *
 * @param metadata - UIMessage metadata object
 * @returns Round number if valid, undefined otherwise
 *
 * @example
 * ```typescript
 * const roundNumber = extractMetadataRoundNumber(message.metadata);
 * if (roundNumber !== undefined) {
 *   // Safe to use roundNumber as number
 * }
 * ```
 */
export function extractMetadataRoundNumber(metadata: unknown): number | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }

  const m = metadata as Record<string, unknown>;
  const roundNumber = m.roundNumber;

  return typeof roundNumber === 'number' ? roundNumber : undefined;
}

/**
 * Extract participant ID from message metadata (type-safe)
 *
 * **SINGLE SOURCE OF TRUTH**: Use this instead of:
 * - `metadata?.participantId as string`
 * - `(metadata as Record<string, unknown>)?.participantId`
 *
 * @param metadata - UIMessage metadata object
 * @returns Participant ID if valid, undefined otherwise
 *
 * @example
 * ```typescript
 * const participantId = extractMetadataParticipantId(message.metadata);
 * if (participantId) {
 *   // Safe to use participantId as string
 * }
 * ```
 */
export function extractMetadataParticipantId(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }

  const m = metadata as Record<string, unknown>;
  const participantId = m.participantId;

  return typeof participantId === 'string' && participantId.length > 0
    ? participantId
    : undefined;
}

/**
 * Extract participant index from message metadata (type-safe)
 *
 * @param metadata - UIMessage metadata object
 * @returns Participant index if valid, undefined otherwise
 *
 * @example
 * ```typescript
 * const index = extractMetadataParticipantIndex(message.metadata);
 * if (index !== undefined) {
 *   // Safe to use index as number
 * }
 * ```
 */
export function extractMetadataParticipantIndex(metadata: unknown): number | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }

  const m = metadata as Record<string, unknown>;
  const participantIndex = m.participantIndex;

  return typeof participantIndex === 'number' ? participantIndex : undefined;
}

/**
 * Extract model ID from message metadata (type-safe)
 *
 * @param metadata - UIMessage metadata object
 * @returns Model ID if valid, undefined otherwise
 */
export function extractMetadataModelId(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }

  const m = metadata as Record<string, unknown>;
  const modelId = m.model;

  return typeof modelId === 'string' && modelId.length > 0
    ? modelId
    : undefined;
}

/**
 * Validate and extract full metadata using schema (strict)
 *
 * **USE THIS FOR**: Scenarios requiring full schema compliance.
 * **DON'T USE FOR**: Partial metadata extraction (use specific extractors instead).
 *
 * @param metadata - UIMessage metadata object
 * @returns Validated metadata if compliant with schema, undefined otherwise
 *
 * @example
 * ```typescript
 * const validMetadata = validateMessageMetadata(message.metadata);
 * if (validMetadata) {
 *   // Guaranteed to match MessageMetadataSchema
 *   const { roundNumber, participantId, participantIndex } = validMetadata;
 * }
 * ```
 */
export function validateMessageMetadata(metadata: unknown) {
  const result = MessageMetadataSchema.safeParse(metadata);
  return result.success ? result.data : undefined;
}

/**
 * Extract participant ID directly from UIMessage (convenience)
 *
 * **SINGLE SOURCE OF TRUTH**: Use this for extracting participant ID from messages.
 * Replaces inline patterns like: `m.metadata?.participantId as string`
 *
 * @param message - UIMessage object
 * @returns Participant ID if present and valid, undefined otherwise
 *
 * @example
 * ```typescript
 * const messages = await getMessages();
 * const participantMessageIds = messages
 *   .filter(m => getParticipantIdFromMessage(m) !== undefined)
 *   .map(m => m.id);
 * ```
 */
export function getParticipantIdFromMessage(message: UIMessage): string | undefined {
  return extractMetadataParticipantId(message.metadata);
}

/**
 * Extract round number directly from UIMessage (convenience)
 *
 * **SINGLE SOURCE OF TRUTH**: Use this for extracting round number from messages.
 * Replaces inline patterns like: `m.metadata?.roundNumber as number`
 *
 * @param message - UIMessage object
 * @returns Round number if present and valid, undefined otherwise
 *
 * @example
 * ```typescript
 * const roundMessages = messages.filter(m => {
 *   const round = getRoundNumberFromMessage(m);
 *   return round === targetRound;
 * });
 * ```
 */
export function getRoundNumberFromMessage(message: UIMessage): number | undefined {
  return extractMetadataRoundNumber(message.metadata);
}
