/**
 * Pure TypeScript Type Guards
 * No runtime Zod validation - uses structural checks for performance
 *
 * ✅ PATTERN: Type guards use discriminant property checks instead of Zod schemas
 * ✅ PERFORMANCE: Zero runtime overhead compared to Zod .safeParse()
 * ✅ TYPE-SAFE: Full TypeScript inference via in-operator narrowing
 */

import { ChangelogChangeTypes, MessageRoles, UIMessageRoles } from '@roundtable/shared';

import type {
  DbAssistantMessageMetadata,
  DbChangelogData,
  DbMessageMetadata,
  DbModeratorMessageMetadata,
  DbPreSearchMessageMetadata,
  DbUserMessageMetadata,
} from './threads';

// ============================================================================
// Type-Safe Property Access Helper
// ============================================================================

/**
 * Type-safe property access after in-operator check
 * Returns the property value with proper type narrowing
 */
function getProperty<T extends object, K extends string>(
  obj: T,
  key: K,
): K extends keyof T ? T[K] : unknown {
  return (obj as Record<string, unknown>)[key] as K extends keyof T ? T[K] : unknown;
}

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
  if (metadata.role !== MessageRoles.ASSISTANT)
    return false;
  if (!('participantId' in metadata))
    return false;
  // Exclude moderator messages: check if isModerator exists and is true
  if ('isModerator' in metadata && getProperty(metadata, 'isModerator') === true)
    return false;
  return true;
}

/**
 * Check if metadata is for a pre-search system message
 */
export function isPreSearchMessageMetadata(metadata: DbMessageMetadata): metadata is DbPreSearchMessageMetadata {
  if (metadata.role !== UIMessageRoles.SYSTEM)
    return false;
  if (!('isPreSearch' in metadata))
    return false;
  return getProperty(metadata, 'isPreSearch') === true;
}

/**
 * Check if metadata is for a moderator message
 */
export function isModeratorMessageMetadata(metadata: DbMessageMetadata): metadata is DbModeratorMessageMetadata {
  if (metadata.role !== MessageRoles.ASSISTANT)
    return false;
  if (!('isModerator' in metadata))
    return false;
  return getProperty(metadata, 'isModerator') === true;
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
export function isParticipantChange(data: DbChangelogData): data is Extract<DbChangelogData, { type: typeof ChangelogChangeTypes.PARTICIPANT }> {
  return data.type === ChangelogChangeTypes.PARTICIPANT;
}

/**
 * Check if changelog data is a participant role change
 */
export function isParticipantRoleChange(data: DbChangelogData): data is Extract<DbChangelogData, { type: typeof ChangelogChangeTypes.PARTICIPANT_ROLE }> {
  return data.type === ChangelogChangeTypes.PARTICIPANT_ROLE;
}

/**
 * Check if changelog data is a mode change
 */
export function isModeChange(data: DbChangelogData): data is Extract<DbChangelogData, { type: typeof ChangelogChangeTypes.MODE_CHANGE }> {
  return data.type === ChangelogChangeTypes.MODE_CHANGE;
}

/**
 * Check if changelog data is a participant reorder
 */
export function isParticipantReorder(data: DbChangelogData): data is Extract<DbChangelogData, { type: typeof ChangelogChangeTypes.PARTICIPANT_REORDER }> {
  return data.type === ChangelogChangeTypes.PARTICIPANT_REORDER;
}

/**
 * Check if changelog data is a web search change
 */
export function isWebSearchChange(data: DbChangelogData): data is Extract<DbChangelogData, { type: typeof ChangelogChangeTypes.WEB_SEARCH }> {
  return data.type === ChangelogChangeTypes.WEB_SEARCH;
}

/**
 * Check if changelog data is a memory created event
 * Note: Uses type intersection since memory_created may not be in RPC-inferred types
 */
export function isMemoryCreatedChange(data: DbChangelogData): data is DbChangelogData & { type: typeof ChangelogChangeTypes.MEMORY_CREATED } {
  return data.type === ChangelogChangeTypes.MEMORY_CREATED;
}
