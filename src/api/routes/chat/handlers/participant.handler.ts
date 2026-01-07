import type { RouteHandler } from '@hono/zod-openapi';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { ulid } from 'ulid';

import { executeBatch } from '@/api/common/batch-operations';
import { verifyParticipantOwnership, verifyThreadOwnership } from '@/api/common/permissions';
import { createHandler, createHandlerWithBatch, IdParamSchema, Responses } from '@/api/core';
import { ChangelogChangeTypes, ChangelogTypes, MessageRoles } from '@/api/core/enums';
import { validateModelAccess, validateTierLimits } from '@/api/services/participant-validation.service';
import { getUserTier } from '@/api/services/usage-tracking.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import {
  isParticipantRoleChange,
  safeParseChangelogData,
} from '@/db/schemas/chat-metadata';
import { calculateNextRound, NO_ROUND_SENTINEL } from '@/lib/schemas/round-schemas';

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
    validateParams: IdParamSchema,
    validateBody: AddParticipantRequestSchema,
    operationName: 'addParticipant',
  },
  async (c, batch) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const body = c.validated.body;
    const db = batch.db;
    await verifyThreadOwnership(id, user.id, db);
    const userTier = await getUserTier(user.id);

    await validateTierLimits(id, userTier, db);
    await validateModelAccess(body.modelId, userTier);

    // Get round number BEFORE batch (read-only)
    const existingUserMessages = await db.query.chatMessage.findMany({
      where: and(
        eq(tables.chatMessage.threadId, id),
        eq(tables.chatMessage.role, MessageRoles.USER),
      ),
      columns: { roundNumber: true },
      orderBy: desc(tables.chatMessage.roundNumber),
      limit: 1,
    });
    const lastRoundNumber = existingUserMessages[0]?.roundNumber ?? NO_ROUND_SENTINEL;
    const nextRoundNumber = calculateNextRound(lastRoundNumber);

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
        id: participantId,
        threadId: id,
        modelId: body.modelId,
        role,
        priority: body.priority ?? 0,
        isEnabled: true,
        settings: body.settings ?? null,
        createdAt: now,
        updatedAt: now,
      }).returning(),
      db.insert(tables.chatThreadChangelog).values({
        id: changelogId,
        threadId: id,
        roundNumber: nextRoundNumber,
        changeType: ChangelogTypes.ADDED,
        changeSummary: summary,
        changeData: {
          type: ChangelogChangeTypes.PARTICIPANT,
          participantId,
          modelId: body.modelId,
          role,
        },
        createdAt: now,
      }),
      db.update(tables.chatThread).set({ updatedAt: now }).where(eq(tables.chatThread.id, id)),
    ]);

    const participant = (results[0] as Array<typeof tables.chatParticipant.$inferSelect>)[0];

    return Responses.ok(c, {
      participant,
    });
  },
);
export const updateParticipantHandler: RouteHandler<typeof updateParticipantRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    validateBody: UpdateParticipantRequestSchema,
    operationName: 'updateParticipant',
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
      const existingUserMessages = await db.query.chatMessage.findMany({
        where: and(
          eq(tables.chatMessage.threadId, participant.threadId),
          eq(tables.chatMessage.role, MessageRoles.USER),
        ),
        columns: { roundNumber: true },
        orderBy: desc(tables.chatMessage.roundNumber),
        limit: 1,
      });
      const lastRoundNumber = existingUserMessages[0]?.roundNumber ?? NO_ROUND_SENTINEL;
      nextRoundNumber = calculateNextRound(lastRoundNumber);

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
    type ChangelogOp = 'none' | 'delete' | 'update' | 'insert';
    let changelogOp: ChangelogOp = 'none';
    let baselineRole: string | null = null;

    if (roleChanged) {
      if (existingRoleChange) {
        const validated = safeParseChangelogData(existingRoleChange.changeData);
        if (!validated || !isParticipantRoleChange(validated)) {
          changelogOp = 'delete';
        } else {
          baselineRole = validated.oldRole ?? null;
          changelogOp = baselineRole === newRole ? 'delete' : 'update';
        }
      } else {
        changelogOp = 'insert';
        baselineRole = participant.role;
      }
    }

    const modelName = participant.modelId.split('/').pop() || participant.modelId;

    // ✅ ATOMIC: Update participant + changelog in single batch
    // Build operations array based on changelog decision
    const ops: BatchItem<'sqlite'>[] = [
      db.update(tables.chatParticipant).set({
        role: newRole,
        priority: body.priority,
        isEnabled: body.isEnabled,
        settings: body.settings ?? undefined,
        updatedAt: now,
      }).where(eq(tables.chatParticipant.id, id)).returning(),
    ];

    if (changelogOp === 'delete' && existingRoleChange) {
      ops.push(db.delete(tables.chatThreadChangelog).where(eq(tables.chatThreadChangelog.id, existingRoleChange.id)));
    } else if (changelogOp === 'update' && existingRoleChange) {
      ops.push(db.update(tables.chatThreadChangelog).set({
        changeSummary: `Updated ${modelName} role from ${baselineRole || 'none'} to ${newRole || 'none'}`,
        changeData: {
          type: ChangelogChangeTypes.PARTICIPANT_ROLE,
          participantId: id,
          modelId: participant.modelId,
          oldRole: baselineRole,
          newRole,
        },
        createdAt: now,
      }).where(eq(tables.chatThreadChangelog.id, existingRoleChange.id)));
    } else if (changelogOp === 'insert') {
      ops.push(db.insert(tables.chatThreadChangelog).values({
        id: ulid(),
        threadId: participant.threadId,
        roundNumber: nextRoundNumber,
        changeType: ChangelogTypes.MODIFIED,
        changeSummary: `Updated ${modelName} role from ${baselineRole || 'none'} to ${newRole || 'none'}`,
        changeData: {
          type: ChangelogChangeTypes.PARTICIPANT_ROLE,
          participantId: id,
          modelId: participant.modelId,
          oldRole: baselineRole,
          newRole,
        },
        createdAt: now,
      }));
      ops.push(db.update(tables.chatThread).set({ updatedAt: now }).where(eq(tables.chatThread.id, participant.threadId)));
    }

    const results = await executeBatch(db, ops);
    const updatedParticipant = (results[0] as Array<typeof tables.chatParticipant.$inferSelect>)[0];

    return Responses.ok(c, {
      participant: updatedParticipant,
    });
  },
);
export const deleteParticipantHandler: RouteHandler<typeof deleteParticipantRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    operationName: 'deleteParticipant',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const db = await getDbAsync();
    const participant = await verifyParticipantOwnership(id, user.id, db);

    // Collect reads BEFORE batch
    const existingUserMessages = await db.query.chatMessage.findMany({
      where: and(
        eq(tables.chatMessage.threadId, participant.threadId),
        eq(tables.chatMessage.role, MessageRoles.USER),
      ),
      columns: { roundNumber: true },
      orderBy: desc(tables.chatMessage.roundNumber),
      limit: 1,
    });
    const lastRoundNumber = existingUserMessages[0]?.roundNumber ?? NO_ROUND_SENTINEL;
    const nextRoundNumber = calculateNextRound(lastRoundNumber);

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
        id: changelogId,
        threadId: participant.threadId,
        roundNumber: nextRoundNumber,
        changeType: ChangelogTypes.REMOVED,
        changeSummary: summary,
        changeData: {
          type: ChangelogChangeTypes.PARTICIPANT,
          participantId: id,
          modelId: participant.modelId,
          role: participant.role,
        },
        createdAt: now,
      }),
      db.update(tables.chatThread).set({ updatedAt: now }).where(eq(tables.chatThread.id, participant.threadId)),
    ]);

    return Responses.ok(c, {
      deleted: true,
    });
  },
);
