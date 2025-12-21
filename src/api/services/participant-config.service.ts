/**
 * Participant Configuration Service
 *
 * Extracted from streaming.handler.ts (260 lines) for improved testability and reusability.
 * Handles participant change detection, database operations, and changelog generation.
 *
 * ✅ PATTERN: Single Responsibility - focuses solely on participant config management
 * ✅ TYPE-SAFE: Uses Drizzle types and Zod validation
 * ✅ TESTABLE: Pure functions that can be unit tested
 * ✅ ZOD-FIRST: All types imported from schema.ts (Single Source of Truth)
 *
 * Location: /src/api/services/participant-config.service.ts
 * Used by: /src/api/routes/chat/handlers/streaming.handler.ts
 */

import { eq } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { ulid } from 'ulid';

import { createError, normalizeError } from '@/api/common/error-handling';
import { ChangelogTypes } from '@/api/core/enums';
import type {
  ChatParticipant,
  ParticipantConfigInput,
} from '@/api/routes/chat/schema';
import type { TypedLogger } from '@/api/types/logger';
import type { DbType } from '@/db';
import * as tables from '@/db';
import type { DbChangelogData } from '@/db/schemas/chat-metadata';

// ============================================================================
// TYPES (imported from schema.ts - no manual definitions)
// ============================================================================

export type { ParticipantConfigInput };

export type ParticipantChangeResult = {
  insertOps: BatchItem<'sqlite'>[];
  updateOps: BatchItem<'sqlite'>[];
  disableOps: BatchItem<'sqlite'>[];
  reenableOps: BatchItem<'sqlite'>[];
  changelogOps: BatchItem<'sqlite'>[];
  participantIdMapping: Map<string, string>; // tempId -> realDbId
};

export type ChangelogEntry = {
  id: string;
  changeType: typeof ChangelogTypes[keyof typeof ChangelogTypes];
  changeSummary: string;
  changeData: DbChangelogData;
};

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validates that all provided participants have unique modelIds
 *
 * ✅ ERROR HANDLING: Comprehensive error context following error-metadata.service.ts pattern
 * ✅ LOGGING: Edge case logging for duplicate detection
 *
 * @param participants - Array of participant configurations to validate
 * @param logger - Optional logger for edge case tracking
 * @throws BadRequestError if duplicates found
 */
export function validateParticipantUniqueness(
  participants: ParticipantConfigInput[],
  logger?: TypedLogger,
): void {
  const modelIds = participants.map(p => p.modelId);
  const uniqueModelIds = new Set(modelIds);

  if (modelIds.length !== uniqueModelIds.size) {
    // Find duplicates for error message
    const duplicates = modelIds.filter((id, index) => modelIds.indexOf(id) !== index);

    // ✅ LOG: Duplicate modelIds detected (validation edge case)
    if (logger) {
      logger.warn('Duplicate modelIds detected in participant configuration', {
        logType: 'validation',
        duplicates,
        totalParticipants: participants.length,
        uniqueCount: uniqueModelIds.size,
      });
    }

    // ✅ ERROR CONTEXT: Validation error with field context
    throw createError.badRequest(
      `Duplicate modelIds found in participants: ${duplicates.join(', ')}. Each model can only appear once.`,
      {
        errorType: 'validation',
        field: 'participants',
      },
    );
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Extracts model name from modelId (e.g., "openai/gpt-4" -> "gpt-4")
 */
function extractModelName(modelId: string): string {
  const parts = modelId.split('/');
  return parts[parts.length - 1] || modelId;
}

// ============================================================================
// CHANGE DETECTION
// ============================================================================

/**
 * Detects all types of participant changes between current and provided state
 *
 * ✅ ERROR HANDLING: Validates unique modelIds with error context
 * ✅ LOGGING: Optional logger for validation edge cases
 *
 * @param allDbParticipants - All participants from database (including disabled)
 * @param providedParticipants - New participant configuration from API
 * @param logger - Optional logger for edge case tracking
 * @returns Categorized participant changes
 */
export function detectParticipantChanges(
  allDbParticipants: ChatParticipant[],
  providedParticipants: ParticipantConfigInput[],
  logger?: TypedLogger,
) {
  const enabledDbParticipants = allDbParticipants.filter(p => p.isEnabled);
  const providedEnabledParticipants = providedParticipants.filter(p => p.isEnabled !== false);

  // Validate no duplicates in provided participants
  validateParticipantUniqueness(providedEnabledParticipants, logger);

  // Detect removed participants (in enabled DB but not in provided list)
  const removedParticipants = enabledDbParticipants.filter(
    dbP => !providedEnabledParticipants.find(p => p.modelId === dbP.modelId),
  );

  // Detect truly new participants (not in DB at all, including disabled)
  const addedParticipants = providedEnabledParticipants.filter(
    provided => !allDbParticipants.find(dbP => dbP.modelId === provided.modelId),
  );

  // Detect re-enabled participants (exist in DB but disabled)
  const reenabledParticipants = providedEnabledParticipants.filter((provided) => {
    const dbP = allDbParticipants.find(db => db.modelId === provided.modelId);
    return dbP && !dbP.isEnabled; // Exists but was disabled
  });

  // Detect updated participants (role changed for same modelId)
  const updatedParticipants = providedEnabledParticipants.filter((provided) => {
    const dbP = enabledDbParticipants.find(db => db.modelId === provided.modelId);
    if (!dbP) {
      return false; // This is an added/re-enabled participant, not updated
    }
    // Only consider it updated if the role text actually changed
    const oldRole = dbP.role || null;
    const newRole = provided.role || null;
    return oldRole !== newRole;
  });

  return {
    allDbParticipants,
    enabledDbParticipants,
    providedEnabledParticipants,
    removedParticipants,
    addedParticipants,
    reenabledParticipants,
    updatedParticipants,
  };
}

// ============================================================================
// DATABASE OPERATIONS BUILDER
// ============================================================================

/**
 * Builds database operations for participant configuration changes
 *
 * @param db - Drizzle database instance
 * @param changes - Detected participant changes
 * @param threadId - Thread ID for new participants
 * @param roundNumber - Round number for changelog entries
 * @returns Database operations and participant ID mapping
 */
export function buildParticipantOperations(
  db: DbType,
  changes: ReturnType<typeof detectParticipantChanges>,
  threadId: string,
  roundNumber: number,
): ParticipantChangeResult {
  const {
    enabledDbParticipants,
    providedEnabledParticipants,
    removedParticipants,
    addedParticipants,
    reenabledParticipants,
    updatedParticipants,
  } = changes;

  const participantIdMapping = new Map<string, string>();
  const changelogEntries: ChangelogEntry[] = [];

  // =========================================================================
  // INSERT OPERATIONS - New participants
  // =========================================================================
  const insertOps = addedParticipants.map((provided) => {
    const newId = ulid(); // Generate real database ID
    participantIdMapping.set(provided.id, newId); // Track the mapping
    return db.insert(tables.chatParticipant).values({
      id: newId,
      threadId,
      modelId: provided.modelId,
      role: provided.role ?? null,
      customRoleId: provided.customRoleId ?? null,
      priority: provided.priority,
      isEnabled: provided.isEnabled ?? true,
      settings: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  // =========================================================================
  // UPDATE OPERATIONS - Existing participants
  // =========================================================================
  const updateOps = providedEnabledParticipants
    .map((provided) => {
      // Find matching DB participant by modelId only
      const dbP = enabledDbParticipants.find(db => db.modelId === provided.modelId);
      if (!dbP) {
        return null; // Not an existing participant, skip
      }

      // Update with new role, priority, customRoleId, and isEnabled status
      return db.update(tables.chatParticipant)
        .set({
          role: provided.role ?? null,
          customRoleId: provided.customRoleId ?? null,
          priority: provided.priority,
          isEnabled: provided.isEnabled ?? true,
          updatedAt: new Date(),
        })
        .where(eq(tables.chatParticipant.id, dbP.id));
    })
    .filter((op): op is NonNullable<typeof op> => op !== null);

  // =========================================================================
  // DISABLE OPERATIONS - Removed participants
  // =========================================================================
  const disableOps = removedParticipants.map(removed =>
    db.update(tables.chatParticipant)
      .set({
        isEnabled: false,
        updatedAt: new Date(),
      })
      .where(eq(tables.chatParticipant.id, removed.id)),
  );

  // =========================================================================
  // RE-ENABLE OPERATIONS - Previously disabled participants
  // =========================================================================
  // ✅ FIX: Use allDbParticipants from changes (includes disabled participants)
  // Previously this created a local variable that only had enabled + removed,
  // missing disabled participants from previous rounds which broke re-enable detection
  const reenableOps = reenabledParticipants.map((provided) => {
    const dbP = changes.allDbParticipants.find(db => db.modelId === provided.modelId);
    if (!dbP) {
      return null; // Should never happen due to filter logic, but safety check
    }
    // Track the mapping for changelog (reuse existing DB ID)
    participantIdMapping.set(provided.id, dbP.id);
    return db.update(tables.chatParticipant)
      .set({
        isEnabled: true,
        role: provided.role ?? null,
        customRoleId: provided.customRoleId ?? null,
        priority: provided.priority,
        updatedAt: new Date(),
      })
      .where(eq(tables.chatParticipant.id, dbP.id));
  }).filter((op): op is NonNullable<typeof op> => op !== null);

  // =========================================================================
  // CHANGELOG ENTRIES
  // =========================================================================

  if (removedParticipants.length > 0) {
    removedParticipants.forEach((removed) => {
      const modelName = extractModelName(removed.modelId);
      const displayName = removed.role || modelName;
      changelogEntries.push({
        id: ulid(),
        changeType: ChangelogTypes.REMOVED,
        changeSummary: `Removed ${displayName}`,
        changeData: {
          type: 'participant',
          participantId: removed.id,
          modelId: removed.modelId,
          role: removed.role,
        },
      });
    });
  }

  // Added participants
  if (addedParticipants.length > 0) {
    addedParticipants.forEach((added) => {
      const modelName = extractModelName(added.modelId);
      const displayName = added.role || modelName;
      const realDbId = participantIdMapping.get(added.id);
      changelogEntries.push({
        id: ulid(),
        changeType: ChangelogTypes.ADDED,
        changeSummary: `Added ${displayName}`,
        changeData: {
          type: 'participant',
          participantId: realDbId || added.id,
          modelId: added.modelId,
          role: added.role,
        },
      });
    });
  }

  // Updated participants (role changes)
  if (updatedParticipants.length > 0) {
    updatedParticipants.forEach((updated) => {
      const dbP = enabledDbParticipants.find(db => db.modelId === updated.modelId);
      if (!dbP) {
        return;
      }

      const oldRole = dbP.role || null;
      const newRole = updated.role || null;

      // Only create changelog if role actually changed
      if (oldRole !== newRole) {
        const modelName = extractModelName(updated.modelId);
        const oldDisplay = oldRole || 'No Role';
        const newDisplay = newRole || 'No Role';

        changelogEntries.push({
          id: ulid(),
          changeType: ChangelogTypes.MODIFIED,
          changeSummary: `Updated ${modelName} role from "${oldDisplay}" to "${newDisplay}"`,
          changeData: {
            type: 'participant_role',
            participantId: dbP.id,
            modelId: updated.modelId, // ✅ Required for UI to display model info
            oldRole,
            newRole,
          },
        });
      }
    });
  }

  // Re-enabled participants
  if (reenabledParticipants.length > 0) {
    reenabledParticipants.forEach((reenabled) => {
      const modelName = extractModelName(reenabled.modelId);
      const displayName = reenabled.role || modelName;
      // ✅ FIX: Use changes.allDbParticipants to find disabled participants from previous rounds
      const dbP = changes.allDbParticipants.find(db => db.modelId === reenabled.modelId);
      changelogEntries.push({
        id: ulid(),
        changeType: ChangelogTypes.ADDED, // Treat as "added" for user-facing message
        changeSummary: `Added ${displayName}`,
        changeData: {
          type: 'participant',
          participantId: dbP?.id || reenabled.id,
          modelId: reenabled.modelId,
          role: reenabled.role,
        },
      });
    });
  }

  // =========================================================================
  // BUILD CHANGELOG OPERATIONS
  // =========================================================================
  const changelogOps = changelogEntries.map(entry =>
    db.insert(tables.chatThreadChangelog)
      .values({
        id: entry.id,
        threadId,
        roundNumber,
        changeType: entry.changeType,
        changeSummary: entry.changeSummary,
        changeData: entry.changeData,
        createdAt: new Date(),
      })
      .onConflictDoNothing(),
  );

  return {
    insertOps,
    updateOps,
    disableOps,
    reenableOps,
    changelogOps,
    participantIdMapping,
  };
}

// ============================================================================
// MAIN SERVICE FUNCTION
// ============================================================================

/**
 * Processes participant configuration changes
 *
 * Main entry point for participant config management.
 * Detects changes, builds operations, and returns them for atomic execution.
 *
 * ✅ ERROR HANDLING: Comprehensive error context following error-metadata.service.ts pattern
 * ✅ LOGGING: Edge case logging for change detection and operation building
 *
 * @param db - Drizzle database instance
 * @param allDbParticipants - All participants from database (including disabled)
 * @param providedParticipants - New participant configuration from API
 * @param threadId - Thread ID for new participants
 * @param roundNumber - Round number for changelog entries (should be nextRoundNumber)
 * @param logger - Optional logger for edge case tracking
 * @returns Database operations ready for batch execution
 *
 * @example
 * const result = processParticipantChanges(
 *   db,
 *   thread.participants,
 *   providedParticipants,
 *   threadId,
 *   currentRoundNumber + 1, // nextRoundNumber
 *   logger
 * );
 *
 * if (result.hasChanges) {
 *   await executeBatch(db, [
 *     ...result.insertOps,
 *     ...result.updateOps,
 *     ...result.reenableOps,
 *     ...result.disableOps,
 *     ...result.changelogOps,
 *   ]);
 * }
 */
export function processParticipantChanges(
  db: DbType,
  allDbParticipants: ChatParticipant[],
  providedParticipants: ParticipantConfigInput[],
  threadId: string,
  roundNumber: number,
  logger?: TypedLogger,
): ParticipantChangeResult & { hasChanges: boolean } {
  try {
    // Detect all changes
    const changes = detectParticipantChanges(allDbParticipants, providedParticipants, logger);

    // Build operations
    const operations = buildParticipantOperations(db, changes, threadId, roundNumber);

    // Check if there are any changes
    const hasChanges
      = operations.insertOps.length > 0
        || operations.updateOps.length > 0
        || operations.disableOps.length > 0
        || operations.reenableOps.length > 0
        || operations.changelogOps.length > 0;

    // ✅ LOG: Participant change summary
    if (logger && hasChanges) {
      logger.info('Participant configuration changes detected', {
        logType: 'operation',
        operationName: 'participant_config_changes',
        threadId,
        roundNumber,
        addedCount: operations.insertOps.length,
        updatedCount: operations.updateOps.length,
        disabledCount: operations.disableOps.length,
        reenabledCount: operations.reenableOps.length,
        changelogCount: operations.changelogOps.length,
      });
    }

    return {
      ...operations,
      hasChanges,
    };
  } catch (error) {
    // ✅ LOG: Participant config processing failure
    if (logger) {
      logger.error('Failed to process participant configuration changes', {
        logType: 'operation',
        operationName: 'participant_config_changes',
        threadId,
        roundNumber,
        error: normalizeError(error),
      });
    }

    // Re-throw validation errors (BadRequestError from validateParticipantUniqueness)
    throw error;
  }
}
