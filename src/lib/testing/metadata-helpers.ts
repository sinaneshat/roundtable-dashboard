/**
 * Type-Safe Metadata Test Helpers
 *
 * Provides typed utilities for accessing message metadata in tests.
 * REPLACES force type casts like `(metadata as DbAssistantMessageMetadata)`.
 */

import type { UIMessage } from 'ai';

import type { FinishReason } from '@/api/core/enums';
import { FinishReasonSchema, MessageRoles } from '@/api/core/enums';
import type { DbAssistantMessageMetadata, DbUserMessageMetadata } from '@/db/schemas/chat-metadata';
import { getParticipantId, getParticipantIndex, getRoundNumber } from '@/lib/utils';

/**
 * Type guard: check if message has user metadata
 */
export function hasUserMetadata(message: UIMessage): message is UIMessage & {
  metadata: DbUserMessageMetadata;
} {
  return (
    message.metadata !== undefined
    && message.metadata !== null
    && typeof message.metadata === 'object'
    && 'role' in message.metadata
    && message.metadata.role === MessageRoles.USER
  );
}

/**
 * Type guard: check if message has assistant metadata
 */
export function hasAssistantMetadata(message: UIMessage): message is UIMessage & {
  metadata: DbAssistantMessageMetadata;
} {
  return (
    message.metadata !== undefined
    && message.metadata !== null
    && typeof message.metadata === 'object'
    && 'role' in message.metadata
    && message.metadata.role === MessageRoles.ASSISTANT
  );
}

/**
 * Type guard: check if metadata is moderator
 */
export function isModeratorMetadata(metadata: unknown): metadata is DbAssistantMessageMetadata & {
  isModerator: true;
} {
  return (
    metadata !== null
    && typeof metadata === 'object'
    && 'isModerator' in metadata
    && metadata.isModerator === true
  );
}

/**
 * Safely extract round number from message metadata
 * REPLACES: `(m.metadata as { roundNumber: number }).roundNumber`
 */
export function getMetadataRoundNumber(metadata: unknown): number | null {
  return getRoundNumber(metadata);
}

/**
 * Safely extract participant index from message metadata
 * REPLACES: `(m.metadata as { participantIndex: number }).participantIndex`
 */
export function getMetadataParticipantIndex(metadata: unknown): number | null {
  return getParticipantIndex(metadata);
}

/**
 * Safely extract finish reason from message metadata
 * REPLACES: `(m.metadata as { finishReason: FinishReason }).finishReason`
 */
export function getMetadataFinishReason(metadata: unknown): FinishReason | null {
  if (
    metadata
    && typeof metadata === 'object'
    && 'finishReason' in metadata
    && typeof metadata.finishReason === 'string'
  ) {
    const result = FinishReasonSchema.safeParse(metadata.finishReason);
    return result.success ? result.data : null;
  }
  return null;
}

/**
 * Safely extract participant ID from message metadata
 * REPLACES: `(m.metadata as { participantId: string }).participantId`
 * @deprecated Use getParticipantId from @/lib/utils instead
 */
export function getMetadataParticipantId(metadata: unknown): string | null {
  return getParticipantId(metadata);
}

/**
 * Safely extract createdAt from message metadata
 * REPLACES: `(m.metadata as { createdAt: string }).createdAt`
 */
export function getMetadataCreatedAt(metadata: unknown): string | null {
  if (
    metadata
    && typeof metadata === 'object'
    && 'createdAt' in metadata
    && typeof metadata.createdAt === 'string'
  ) {
    return metadata.createdAt;
  }
  return null;
}

/**
 * Check if metadata indicates moderator message
 * REPLACES: `(m.metadata as { isModerator?: boolean }).isModerator === true`
 */
export function isMetadataModerator(metadata: unknown): boolean {
  return isModeratorMetadata(metadata);
}

/**
 * Type-safe assertion: get user metadata or throw
 */
export function assertUserMetadata(message: UIMessage): DbUserMessageMetadata {
  if (!hasUserMetadata(message)) {
    throw new Error(`Expected user message, got ${message.role}`);
  }
  return message.metadata;
}

/**
 * Type-safe assertion: get assistant metadata or throw
 */
export function assertAssistantMetadata(message: UIMessage): DbAssistantMessageMetadata {
  if (!hasAssistantMetadata(message)) {
    throw new Error(`Expected assistant message, got ${message.role}`);
  }
  return message.metadata;
}

/**
 * Safely check if metadata indicates optimistic message
 * REPLACES: `(m.metadata as { isOptimistic?: boolean }).isOptimistic === true`
 */
export function isOptimisticMessage(metadata: unknown): boolean {
  return (
    metadata !== null
    && typeof metadata === 'object'
    && 'isOptimistic' in metadata
    && metadata.isOptimistic === true
  );
}
