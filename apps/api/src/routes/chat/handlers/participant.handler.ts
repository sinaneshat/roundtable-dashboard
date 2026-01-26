import type { RouteHandler } from '@hono/zod-openapi';
import type { ChangelogOperation } from '@roundtable/shared/enums';
import { ChangelogChangeTypes, ChangelogOperations, ChangelogTypes } from '@roundtable/shared/enums';
import { and, eq, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { ulid } from 'ulid';

import { executeBatch } from '@/common/batch-operations';
import { createError } from '@/common/error-handling';
import { verifyParticipantOwnership, verifyThreadOwnership } from '@/common/permissions';
import { createHandler, createHandlerWithBatch, IdParamSchema, Responses } from '@/core';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import {
  isParticipantRoleChange,
  safeParseChangelogData,
} from '@/db/schemas/chat-metadata';
import { isFreeUserWithPendingRound } from '@/services/billing';
import { validateModelAccess, validateTierLimits } from '@/services/participants';
import { getNextRoundForChangelog } from '@/services/threads';
import { getUserTier } from '@/services/usage';
import type { ApiEnv } from '@/types';

import type {
  addParticipantRoute,
  deleteParticipantRoute,
  updateParticipantRoute,
} from '../route';
import {
  AddParticipantRequestSchema,
  UpdateParticipantRequestSchema,
} from '../schema';

export const addParticipantHandler: RouteHandler<typeof addParticipantRoute, ApiEnv> = createHandlerWithBatch(
  {
    auth: 'session',
    operationName: 'addParticipant',
    validateBody: AddParticipantRequestSchema,
    validateParams: IdParamSchema,
  },
  async (c, batch) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const body = c.validated.body;
    const db = batch.db;
    await verifyThreadOwnership(id, user.id, db);
    const userTier = await getUserTier(user.id);

    // ✅ FREE ROUND BYPASS: Free users who haven't completed their free round
    // can add ANY models (within limit) for their first experience.
    const skipPricingCheck = await isFreeUserWithPendingRound(user.id, userTier);

    // ✅ OPTIMIZED: Parallelize independent validations (tier limits query + model access check)
    await Promise.all([
      validateTierLimits(id, userTier, db),
      validateModelAccess(body.modelId, userTier, { skipPricingCheck }),
    ]);

    // Get round number BEFORE batch (read-only)
    const nextRoundNumber = await getNextRoundForChangelog(id, db);

    // Prepare IDs and data
    const participantId = ulid();
    const changelogId = ulid();
    const now = new Date();
    const modelName = body.modelId.split('/').pop() || body.modelId;
    const role = body.role ?? null;
    const summary = role ? `Added ${modelName} as ${role}` : `Added ${modelName}`;

    // ✅ ATOMIC: Insert participant + changelog in single batch
    const results = await executeBatch(db, [
      db.insert(tables.chatParticipant).values({
        createdAt: now,
        id: participantId,
        isEnabled: true,
        modelId: body.modelId,
        priority: body.priority ?? 0,
        role,
        settings: body.settings ?? null,
        threadId: id,
        updatedAt: now,
      }).returning(),
      db.insert(tables.chatThreadChangelog).values({
        changeData: {
          modelId: body.modelId,
          participantId,
          role,
          type: ChangelogChangeTypes.PARTICIPANT,
        },
        changeSummary: summary,
        changeType: ChangelogTypes.ADDED,
        createdAt: now,
        id: changelogId,
        roundNumber: nextRoundNumber,
        threadId: id,
      }),
      db.update(tables.chatThread).set({ updatedAt: now }).where(eq(tables.chatThread.id, id)),
    ]);

    const participantResult = results[0];
    if (!Array.isArray(participantResult) || participantResult.length === 0) {
      throw createError.internal('Failed to create participant', { errorType: 'database', operation: 'insert', table: 'chatParticipant' });
    }
    const participant = participantResult[0];

    return Responses.ok(c, {
      participant,
    });
  },
);
export const updateParticipantHandler: RouteHandler<typeof updateParticipantRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'updateParticipant',
    validateBody: UpdateParticipantRequestSchema,
    validateParams: IdParamSchema,
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const body = c.validated.body;
    const db = await getDbAsync();
    const participant = await verifyParticipantOwnership(id, user.id, db);
    const now = new Date();
    const newRole = body.role ?? null;
    const roleChanged = body.role !== undefined && body.role !== participant.role;

    // Collect all reads BEFORE batch
    let nextRoundNumber = 0;
    let existingRoleChange: typeof tables.chatThreadChangelog.$inferSelect | undefined;

    if (roleChanged) {
      nextRoundNumber = await getNextRoundForChangelog(participant.threadId, db);

      existingRoleChange = await db.query.chatThreadChangelog.findFirst({
        where: and(
          eq(tables.chatThreadChangelog.threadId, participant.threadId),
          eq(tables.chatThreadChangelog.roundNumber, nextRoundNumber),
          sql`json_extract(${tables.chatThreadChangelog.changeData}, '$.type') = 'participant_role'`,
          sql`json_extract(${tables.chatThreadChangelog.changeData}, '$.participantId') = ${id}`,
        ),
      });
    }

    // Determine changelog operation based on reads
    let changelogOp: ChangelogOperation = ChangelogOperations.NONE;
    let baselineRole: string | null = null;

    if (roleChanged) {
      if (existingRoleChange) {
        const validated = safeParseChangelogData(existingRoleChange.changeData);
        if (!validated || !isParticipantRoleChange(validated)) {
          changelogOp = ChangelogOperations.DELETE;
        } else {
          baselineRole = validated.oldRole ?? null;
          changelogOp = baselineRole === newRole ? ChangelogOperations.DELETE : ChangelogOperations.UPDATE;
        }
      } else {
        changelogOp = ChangelogOperations.INSERT;
        baselineRole = participant.role;
      }
    }

    const modelName = participant.modelId.split('/').pop() || participant.modelId;

    // ✅ ATOMIC: Update participant + changelog in single batch
    // Build operations array based on changelog decision
    const ops: BatchItem<'sqlite'>[] = [
      db.update(tables.chatParticipant).set({
        isEnabled: body.isEnabled,
        priority: body.priority,
        role: newRole,
        settings: body.settings ?? undefined,
        updatedAt: now,
      }).where(eq(tables.chatParticipant.id, id)).returning(),
    ];

    if (changelogOp === ChangelogOperations.DELETE && existingRoleChange) {
      ops.push(db.delete(tables.chatThreadChangelog).where(eq(tables.chatThreadChangelog.id, existingRoleChange.id)));
    } else if (changelogOp === ChangelogOperations.UPDATE && existingRoleChange) {
      ops.push(db.update(tables.chatThreadChangelog).set({
        changeData: {
          modelId: participant.modelId,
          newRole,
          oldRole: baselineRole,
          participantId: id,
          type: ChangelogChangeTypes.PARTICIPANT_ROLE,
        },
        changeSummary: `Updated ${modelName} role from ${baselineRole || 'none'} to ${newRole || 'none'}`,
        createdAt: now,
      }).where(eq(tables.chatThreadChangelog.id, existingRoleChange.id)));
    } else if (changelogOp === ChangelogOperations.INSERT) {
      ops.push(db.insert(tables.chatThreadChangelog).values({
        changeData: {
          modelId: participant.modelId,
          newRole,
          oldRole: baselineRole,
          participantId: id,
          type: ChangelogChangeTypes.PARTICIPANT_ROLE,
        },
        changeSummary: `Updated ${modelName} role from ${baselineRole || 'none'} to ${newRole || 'none'}`,
        changeType: ChangelogTypes.MODIFIED,
        createdAt: now,
        id: ulid(),
        roundNumber: nextRoundNumber,
        threadId: participant.threadId,
      }));
      ops.push(db.update(tables.chatThread).set({ updatedAt: now }).where(eq(tables.chatThread.id, participant.threadId)));
    }

    const results = await executeBatch(db, ops);
    const participantResult = results[0];
    if (!Array.isArray(participantResult) || participantResult.length === 0) {
      throw createError.internal('Failed to update participant', { errorType: 'database', operation: 'update', table: 'chatParticipant' });
    }
    const updatedParticipant = participantResult[0];

    return Responses.ok(c, {
      participant: updatedParticipant,
    });
  },
);
export const deleteParticipantHandler: RouteHandler<typeof deleteParticipantRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'deleteParticipant',
    validateParams: IdParamSchema,
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const db = await getDbAsync();
    const participant = await verifyParticipantOwnership(id, user.id, db);

    // Get round number BEFORE batch (read-only)
    const nextRoundNumber = await getNextRoundForChangelog(participant.threadId, db);

    // Prepare changelog data
    const now = new Date();
    const changelogId = ulid();
    const modelName = participant.modelId.split('/').pop() || participant.modelId;
    const summary = participant.role
      ? `Removed ${modelName} (${participant.role})`
      : `Removed ${modelName}`;

    // ✅ ATOMIC: Delete participant + create changelog in single batch
    await executeBatch(db, [
      db.delete(tables.chatParticipant).where(eq(tables.chatParticipant.id, id)),
      db.insert(tables.chatThreadChangelog).values({
        changeData: {
          modelId: participant.modelId,
          participantId: id,
          role: participant.role,
          type: ChangelogChangeTypes.PARTICIPANT,
        },
        changeSummary: summary,
        changeType: ChangelogTypes.REMOVED,
        createdAt: now,
        id: changelogId,
        roundNumber: nextRoundNumber,
        threadId: participant.threadId,
      }),
      db.update(tables.chatThread).set({ updatedAt: now }).where(eq(tables.chatThread.id, participant.threadId)),
    ]);

    return Responses.ok(c, {
      deleted: true,
    });
  },
);
