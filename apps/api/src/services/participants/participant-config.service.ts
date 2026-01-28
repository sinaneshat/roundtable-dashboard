import { ChangelogChangeTypes, ChangelogTypes, ChangelogTypeSchema, LogTypes } from '@roundtable/shared/enums';
import { eq } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { ulid } from 'ulid';
import * as z from 'zod';

import { normalizeError } from '@/common/error-handling';
import type { DbType } from '@/db';
import * as tables from '@/db';
import { DbChangelogDataSchema } from '@/db/schemas/chat-metadata';
import type { ParticipantConfigInput } from '@/lib/schemas';
import type { ChatParticipant } from '@/routes/chat/schema';
import type { TypedLogger } from '@/types/logger';

import { validateParticipantUniqueness } from './participant-validation.service';

// ============================================================================
// SCHEMAS
// ============================================================================

export const ParticipantChangeResultSchema = z.object({
  changelogOps: z.custom<BatchItem<'sqlite'>[]>(val => Array.isArray(val)),
  disableOps: z.custom<BatchItem<'sqlite'>[]>(val => Array.isArray(val)),
  insertOps: z.custom<BatchItem<'sqlite'>[]>(val => Array.isArray(val)),
  participantIdMapping: z.custom<Map<string, string>>(val => val instanceof Map),
  reenableOps: z.custom<BatchItem<'sqlite'>[]>(val => Array.isArray(val)),
  updateOps: z.custom<BatchItem<'sqlite'>[]>(val => Array.isArray(val)),
});

export type ParticipantChangeResult = z.infer<typeof ParticipantChangeResultSchema>;

/**
 * Result of processing participant changes, including change detection flag
 */
export const ProcessParticipantChangesResultSchema = ParticipantChangeResultSchema.extend({
  hasChanges: z.boolean(),
});

export type ProcessParticipantChangesResult = z.infer<typeof ProcessParticipantChangesResultSchema>;

export const ChangelogEntrySchema = z.object({
  changeData: DbChangelogDataSchema,
  changeSummary: z.string(),
  changeType: ChangelogTypeSchema,
  id: z.string(),
}).strict();

export type ChangelogEntry = z.infer<typeof ChangelogEntrySchema>;

// ============================================================================
// HELPERS
// ============================================================================

function extractModelName(modelId: string) {
  const parts = modelId.split('/');
  return parts[parts.length - 1] || modelId;
}

// ============================================================================
// CHANGE DETECTION
// ============================================================================

export function categorizeParticipantChanges(
  allDbParticipants: ChatParticipant[],
  providedParticipants: ParticipantConfigInput[],
) {
  const enabledDbParticipants = allDbParticipants.filter(p => p.isEnabled);
  const providedEnabledParticipants = providedParticipants.filter(p => p.isEnabled !== false);

  validateParticipantUniqueness(providedEnabledParticipants);

  const allDbByModelId = new Map(allDbParticipants.map(p => [p.modelId, p]));
  const enabledDbByModelId = new Map(enabledDbParticipants.map(p => [p.modelId, p]));
  const providedByModelId = new Map(providedEnabledParticipants.map(p => [p.modelId, p]));

  const removedParticipants = enabledDbParticipants.filter(
    dbP => !providedByModelId.has(dbP.modelId),
  );

  const addedParticipants = providedEnabledParticipants.filter(
    provided => !allDbByModelId.has(provided.modelId),
  );

  const reenabledParticipants = providedEnabledParticipants.filter((provided) => {
    const dbP = allDbByModelId.get(provided.modelId);
    return dbP && !dbP.isEnabled;
  });

  const updatedParticipants = providedEnabledParticipants.filter((provided) => {
    const dbP = enabledDbByModelId.get(provided.modelId);
    if (!dbP) {
      return false;
    }
    const oldRole = dbP.role || null;
    const newRole = provided.role || null;
    return oldRole !== newRole;
  });

  return {
    addedParticipants,
    allDbParticipants,
    enabledDbParticipants,
    providedEnabledParticipants,
    reenabledParticipants,
    removedParticipants,
    updatedParticipants,
  };
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

export function buildParticipantOperations(
  db: DbType,
  changes: ReturnType<typeof categorizeParticipantChanges>,
  threadId: string,
  roundNumber: number,
): ParticipantChangeResult {
  const {
    addedParticipants,
    enabledDbParticipants,
    providedEnabledParticipants,
    reenabledParticipants,
    removedParticipants,
    updatedParticipants,
  } = changes;

  const participantIdMapping = new Map<string, string>();
  const changelogEntries: ChangelogEntry[] = [];

  const insertOps = addedParticipants.map((provided) => {
    const newId = ulid();
    participantIdMapping.set(provided.id, newId);
    return db.insert(tables.chatParticipant).values({
      createdAt: new Date(),
      customRoleId: provided.customRoleId ?? null,
      id: newId,
      isEnabled: provided.isEnabled ?? true,
      modelId: provided.modelId,
      priority: provided.priority,
      role: provided.role ?? null,
      settings: null,
      threadId,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      set: {
        customRoleId: provided.customRoleId ?? null,
        isEnabled: provided.isEnabled ?? true,
        priority: provided.priority,
        role: provided.role ?? null,
        updatedAt: new Date(),
      },
      target: [tables.chatParticipant.threadId, tables.chatParticipant.modelId],
    });
  });

  const updateOps = providedEnabledParticipants
    .map((provided) => {
      const dbP = enabledDbParticipants.find(db => db.modelId === provided.modelId);
      if (!dbP) {
        return null;
      }

      return db.update(tables.chatParticipant)
        .set({
          customRoleId: provided.customRoleId ?? null,
          isEnabled: provided.isEnabled ?? true,
          priority: provided.priority,
          role: provided.role ?? null,
          updatedAt: new Date(),
        })
        .where(eq(tables.chatParticipant.id, dbP.id));
    })
    .filter((op): op is NonNullable<typeof op> => op !== null);

  const disableOps = removedParticipants.map(removed =>
    db.update(tables.chatParticipant)
      .set({
        isEnabled: false,
        updatedAt: new Date(),
      })
      .where(eq(tables.chatParticipant.id, removed.id)),
  );

  const reenableOps = reenabledParticipants.map((provided) => {
    const dbP = changes.allDbParticipants.find(db => db.modelId === provided.modelId);
    if (!dbP) {
      return null;
    }
    participantIdMapping.set(provided.id, dbP.id);
    return db.update(tables.chatParticipant)
      .set({
        customRoleId: provided.customRoleId ?? null,
        isEnabled: true,
        priority: provided.priority,
        role: provided.role ?? null,
        updatedAt: new Date(),
      })
      .where(eq(tables.chatParticipant.id, dbP.id));
  }).filter((op): op is NonNullable<typeof op> => op !== null);

  if (removedParticipants.length > 0) {
    removedParticipants.forEach((removed) => {
      const modelName = extractModelName(removed.modelId);
      const displayName = removed.role || modelName;
      changelogEntries.push({
        changeData: {
          modelId: removed.modelId,
          participantId: removed.id,
          role: removed.role,
          type: ChangelogChangeTypes.PARTICIPANT,
        },
        changeSummary: `Removed ${displayName}`,
        changeType: ChangelogTypes.REMOVED,
        id: ulid(),
      });
    });
  }

  if (addedParticipants.length > 0) {
    addedParticipants.forEach((added) => {
      const modelName = extractModelName(added.modelId);
      const displayName = added.role || modelName;
      const realDbId = participantIdMapping.get(added.id);
      changelogEntries.push({
        changeData: {
          modelId: added.modelId,
          participantId: realDbId || added.id,
          role: added.role,
          type: ChangelogChangeTypes.PARTICIPANT,
        },
        changeSummary: `Added ${displayName}`,
        changeType: ChangelogTypes.ADDED,
        id: ulid(),
      });
    });
  }

  if (updatedParticipants.length > 0) {
    updatedParticipants.forEach((updated) => {
      const dbP = enabledDbParticipants.find(db => db.modelId === updated.modelId);
      if (!dbP) {
        return;
      }

      const oldRole = dbP.role || null;
      const newRole = updated.role || null;

      if (oldRole !== newRole) {
        const modelName = extractModelName(updated.modelId);
        const oldDisplay = oldRole || 'No Role';
        const newDisplay = newRole || 'No Role';

        changelogEntries.push({
          changeData: {
            modelId: updated.modelId,
            newRole,
            oldRole,
            participantId: dbP.id,
            type: ChangelogChangeTypes.PARTICIPANT_ROLE,
          },
          changeSummary: `Updated ${modelName} role from "${oldDisplay}" to "${newDisplay}"`,
          changeType: ChangelogTypes.MODIFIED,
          id: ulid(),
        });
      }
    });
  }

  if (reenabledParticipants.length > 0) {
    reenabledParticipants.forEach((reenabled) => {
      const modelName = extractModelName(reenabled.modelId);
      const displayName = reenabled.role || modelName;
      const dbP = changes.allDbParticipants.find(db => db.modelId === reenabled.modelId);
      changelogEntries.push({
        changeData: {
          modelId: reenabled.modelId,
          participantId: dbP?.id || reenabled.id,
          role: reenabled.role,
          type: ChangelogChangeTypes.PARTICIPANT,
        },
        changeSummary: `Added ${displayName}`,
        changeType: ChangelogTypes.ADDED,
        id: ulid(),
      });
    });
  }

  const changelogOps = changelogEntries.map(entry =>
    db.insert(tables.chatThreadChangelog)
      .values({
        changeData: entry.changeData,
        changeSummary: entry.changeSummary,
        changeType: entry.changeType,
        createdAt: new Date(),
        id: entry.id,
        roundNumber,
        threadId,
      })
      .onConflictDoNothing(),
  );

  return {
    changelogOps,
    disableOps,
    insertOps,
    participantIdMapping,
    reenableOps,
    updateOps,
  };
}

// ============================================================================
// MAIN SERVICE
// ============================================================================

export function processParticipantChanges(
  db: DbType,
  allDbParticipants: ChatParticipant[],
  providedParticipants: ParticipantConfigInput[],
  threadId: string,
  roundNumber: number,
  logger?: TypedLogger,
): ProcessParticipantChangesResult {
  try {
    const changes = categorizeParticipantChanges(allDbParticipants, providedParticipants);
    const operations = buildParticipantOperations(db, changes, threadId, roundNumber);

    const hasChanges
      = operations.insertOps.length > 0
        || operations.updateOps.length > 0
        || operations.disableOps.length > 0
        || operations.reenableOps.length > 0
        || operations.changelogOps.length > 0;

    if (logger && hasChanges) {
      logger.info('Participant configuration changes detected', {
        addedCount: operations.insertOps.length,
        changelogCount: operations.changelogOps.length,
        disabledCount: operations.disableOps.length,
        logType: LogTypes.OPERATION,
        operationName: 'participant_config_changes',
        reenabledCount: operations.reenableOps.length,
        roundNumber,
        threadId,
        updatedCount: operations.updateOps.length,
      });
    }

    return {
      ...operations,
      hasChanges,
    };
  } catch (error) {
    if (logger) {
      logger.error('Failed to process participant configuration changes', {
        error: normalizeError(error).message,
        logType: LogTypes.OPERATION,
        operationName: 'participant_config_changes',
        roundNumber,
        threadId,
      });
    }

    throw error;
  }
}
