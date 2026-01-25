import { ChangelogChangeTypes, ChangelogTypes, ChangelogTypeSchema, LogTypes } from '@roundtable/shared/enums';
import { eq } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { ulid } from 'ulid';
import * as z from 'zod';

import { normalizeError } from '@/common/error-handling';
import type { DbType } from '@/db';
import * as tables from '@/db';
import { DbChangelogDataSchema } from '@/db/schemas/chat-metadata';
import type { ParticipantConfigInput } from '@/lib/schemas/participant-schemas';
import type { ChatParticipant } from '@/routes/chat/schema';
import type { TypedLogger } from '@/types/logger';

import { validateParticipantUniqueness } from './participant-validation.service';

// ============================================================================
// SCHEMAS
// ============================================================================

export const ParticipantChangeResultSchema = z.object({
  insertOps: z.custom<BatchItem<'sqlite'>[]>(val => Array.isArray(val)),
  updateOps: z.custom<BatchItem<'sqlite'>[]>(val => Array.isArray(val)),
  disableOps: z.custom<BatchItem<'sqlite'>[]>(val => Array.isArray(val)),
  reenableOps: z.custom<BatchItem<'sqlite'>[]>(val => Array.isArray(val)),
  changelogOps: z.custom<BatchItem<'sqlite'>[]>(val => Array.isArray(val)),
  participantIdMapping: z.custom<Map<string, string>>(val => val instanceof Map),
});

export type ParticipantChangeResult = z.infer<typeof ParticipantChangeResultSchema>;

export const ChangelogEntrySchema = z.object({
  id: z.string(),
  changeType: ChangelogTypeSchema,
  changeSummary: z.string(),
  changeData: DbChangelogDataSchema,
}).strict();

export type ChangelogEntry = z.infer<typeof ChangelogEntrySchema>;

// ============================================================================
// HELPERS
// ============================================================================

function extractModelName(modelId: string): string {
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
// DATABASE OPERATIONS
// ============================================================================

export function buildParticipantOperations(
  db: DbType,
  changes: ReturnType<typeof categorizeParticipantChanges>,
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

  const insertOps = addedParticipants.map((provided) => {
    const newId = ulid();
    participantIdMapping.set(provided.id, newId);
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
    }).onConflictDoUpdate({
      target: [tables.chatParticipant.threadId, tables.chatParticipant.modelId],
      set: {
        role: provided.role ?? null,
        customRoleId: provided.customRoleId ?? null,
        priority: provided.priority,
        isEnabled: provided.isEnabled ?? true,
        updatedAt: new Date(),
      },
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
          role: provided.role ?? null,
          customRoleId: provided.customRoleId ?? null,
          priority: provided.priority,
          isEnabled: provided.isEnabled ?? true,
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
        isEnabled: true,
        role: provided.role ?? null,
        customRoleId: provided.customRoleId ?? null,
        priority: provided.priority,
        updatedAt: new Date(),
      })
      .where(eq(tables.chatParticipant.id, dbP.id));
  }).filter((op): op is NonNullable<typeof op> => op !== null);

  if (removedParticipants.length > 0) {
    removedParticipants.forEach((removed) => {
      const modelName = extractModelName(removed.modelId);
      const displayName = removed.role || modelName;
      changelogEntries.push({
        id: ulid(),
        changeType: ChangelogTypes.REMOVED,
        changeSummary: `Removed ${displayName}`,
        changeData: {
          type: ChangelogChangeTypes.PARTICIPANT,
          participantId: removed.id,
          modelId: removed.modelId,
          role: removed.role,
        },
      });
    });
  }

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
          type: ChangelogChangeTypes.PARTICIPANT,
          participantId: realDbId || added.id,
          modelId: added.modelId,
          role: added.role,
        },
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
          id: ulid(),
          changeType: ChangelogTypes.MODIFIED,
          changeSummary: `Updated ${modelName} role from "${oldDisplay}" to "${newDisplay}"`,
          changeData: {
            type: ChangelogChangeTypes.PARTICIPANT_ROLE,
            participantId: dbP.id,
            modelId: updated.modelId,
            oldRole,
            newRole,
          },
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
        id: ulid(),
        changeType: ChangelogTypes.ADDED,
        changeSummary: `Added ${displayName}`,
        changeData: {
          type: ChangelogChangeTypes.PARTICIPANT,
          participantId: dbP?.id || reenabled.id,
          modelId: reenabled.modelId,
          role: reenabled.role,
        },
      });
    });
  }

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
// MAIN SERVICE
// ============================================================================

export function processParticipantChanges(
  db: DbType,
  allDbParticipants: ChatParticipant[],
  providedParticipants: ParticipantConfigInput[],
  threadId: string,
  roundNumber: number,
  logger?: TypedLogger,
): ParticipantChangeResult & { hasChanges: boolean } {
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
        logType: LogTypes.OPERATION,
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
    if (logger) {
      logger.error('Failed to process participant configuration changes', {
        logType: LogTypes.OPERATION,
        operationName: 'participant_config_changes',
        threadId,
        roundNumber,
        error: normalizeError(error).message,
      });
    }

    throw error;
  }
}
