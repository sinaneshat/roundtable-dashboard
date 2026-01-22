/**
 * Pure TypeScript Type Guards
 * No runtime Zod validation - uses structural checks for performance
 *
 * ✅ PATTERN: Type guards use discriminant property checks instead of Zod schemas
 * ✅ PERFORMANCE: Zero runtime overhead compared to Zod .safeParse()
 * ✅ TYPE-SAFE: Full TypeScript inference without manual casting
 */

import { MessageRoles, UIMessageRoles } from '@roundtable/shared';

import type {
  DbAssistantMessageMetadata,
  DbChangelogData,
  DbMessageMetadata,
  DbModeratorMessageMetadata,
  DbPreSearchMessageMetadata,
  DbUserMessageMetadata,
} from './threads';

// ============================================================================
// Message Metadata Type Guards
// ============================================================================

/**
 * Check if metadata is for a user message
 */
export function isUserMessageMetadata(metadata: DbMessageMetadata): metadata is DbUserMessageMetadata {
  return metadata.role === MessageRoles.USER;
}

/**
 * Check if metadata is for an assistant (participant) message
 * Excludes moderator messages (isModerator: true)
 */
export function isAssistantMessageMetadata(metadata: DbMessageMetadata): metadata is DbAssistantMessageMetadata {
  return (
    metadata.role === MessageRoles.ASSISTANT
    && 'participantId' in metadata
    && !('isModerator' in metadata && (metadata as DbModeratorMessageMetadata).isModerator === true)
  );
}

/**
 * Check if metadata is for a pre-search system message
 */
export function isPreSearchMessageMetadata(metadata: DbMessageMetadata): metadata is DbPreSearchMessageMetadata {
  return metadata.role === UIMessageRoles.SYSTEM && 'isPreSearch' in metadata && (metadata as DbPreSearchMessageMetadata).isPreSearch === true;
}

/**
 * Check if metadata is for a moderator message
 */
export function isModeratorMessageMetadata(metadata: DbMessageMetadata): metadata is DbModeratorMessageMetadata {
  return metadata.role === MessageRoles.ASSISTANT && 'isModerator' in metadata && (metadata as DbModeratorMessageMetadata).isModerator === true;
}

/**
 * Alias for isAssistantMessageMetadata - checks for participant (non-moderator) messages
 */
export function isParticipantMessageMetadata(metadata: DbMessageMetadata): metadata is DbAssistantMessageMetadata {
  return isAssistantMessageMetadata(metadata);
}

// ============================================================================
// Changelog Type Guards
// ============================================================================

/**
 * Check if changelog data is a participant change
 */
export function isParticipantChange(data: DbChangelogData): data is Extract<DbChangelogData, { type: 'participant' }> {
  return data.type === 'participant';
}

/**
 * Check if changelog data is a participant role change
 */
export function isParticipantRoleChange(data: DbChangelogData): data is Extract<DbChangelogData, { type: 'participant_role' }> {
  return data.type === 'participant_role';
}

/**
 * Check if changelog data is a mode change
 */
export function isModeChange(data: DbChangelogData): data is Extract<DbChangelogData, { type: 'mode_change' }> {
  return data.type === 'mode_change';
}

/**
 * Check if changelog data is a participant reorder
 */
export function isParticipantReorder(data: DbChangelogData): data is Extract<DbChangelogData, { type: 'participant_reorder' }> {
  return data.type === 'participant_reorder';
}

/**
 * Check if changelog data is a web search change
 */
export function isWebSearchChange(data: DbChangelogData): data is Extract<DbChangelogData, { type: 'web_search' }> {
  return data.type === 'web_search';
}
