import type { RouteHandler } from '@hono/zod-openapi';
import { and, desc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { verifyParticipantOwnership, verifyThreadOwnership } from '@/api/common/permissions';
import { createHandler, createHandlerWithBatch, Responses } from '@/api/core';
import { IdParamSchema } from '@/api/core/schemas';
import { validateModelAccess, validateTierLimits } from '@/api/services/participant-validation.service';
import {
  logParticipantAdded,
  logParticipantRemoved,
  logParticipantUpdated,
} from '@/api/services/thread-changelog.service';
import { getUserTier } from '@/api/services/usage-tracking.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';
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

    // Validate tier limits (max models per conversation)
    await validateTierLimits(id, userTier, db);

    // Validate model access (tier permissions)
    await validateModelAccess(body.modelId as string, userTier);
    const participantId = ulid();
    const now = new Date();
    const [participant] = await db
      .insert(tables.chatParticipant)
      .values({
        id: participantId,
        threadId: id,
        modelId: body.modelId as string,
        role: body.role as string | null,
        priority: (body.priority as number | undefined) ?? 0,
        isEnabled: true,
        settings: body.settings ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    const existingUserMessages = await db.query.chatMessage.findMany({
      where: and(
        eq(tables.chatMessage.threadId, id),
        eq(tables.chatMessage.role, 'user'),
      ),
      columns: { roundNumber: true },
      orderBy: desc(tables.chatMessage.roundNumber),
      limit: 1,
    });
    const lastRoundNumber = existingUserMessages[0]?.roundNumber ?? NO_ROUND_SENTINEL;
    const nextRoundNumber = calculateNextRound(lastRoundNumber);

    // ✅ SERVICE LAYER: Use thread-changelog.service for changelog creation
    await logParticipantAdded(
      id,
      nextRoundNumber,
      participantId,
      body.modelId as string,
      body.role as string | null,
    );

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
    const [updatedParticipant] = await db
      .update(tables.chatParticipant)
      .set({
        role: body.role as string | null | undefined,
        priority: body.priority as number | undefined,
        isEnabled: body.isEnabled,
        settings: body.settings ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(tables.chatParticipant.id, id))
      .returning();
    if (body.role !== undefined && body.role !== participant.role) {
      const existingUserMessages = await db.query.chatMessage.findMany({
        where: and(
          eq(tables.chatMessage.threadId, participant.threadId),
          eq(tables.chatMessage.role, 'user'),
        ),
        columns: { roundNumber: true },
        orderBy: desc(tables.chatMessage.roundNumber),
        limit: 1,
      });
      const lastRoundNumber = existingUserMessages[0]?.roundNumber ?? NO_ROUND_SENTINEL;
      const nextRoundNumber = calculateNextRound(lastRoundNumber);

      // ✅ SERVICE LAYER: Use thread-changelog.service for changelog creation
      await logParticipantUpdated(
        participant.threadId,
        nextRoundNumber,
        id,
        participant.modelId,
        participant.role,
        body.role as string | null,
      );
    }
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
    const existingUserMessages = await db.query.chatMessage.findMany({
      where: and(
        eq(tables.chatMessage.threadId, participant.threadId),
        eq(tables.chatMessage.role, 'user'),
      ),
      columns: { roundNumber: true },
      orderBy: desc(tables.chatMessage.roundNumber),
      limit: 1,
    });
    const lastRoundNumber = existingUserMessages[0]?.roundNumber ?? NO_ROUND_SENTINEL;
    const nextRoundNumber = calculateNextRound(lastRoundNumber);

    // ✅ SERVICE LAYER: Use thread-changelog.service for changelog creation
    await logParticipantRemoved(
      participant.threadId,
      nextRoundNumber,
      id,
      participant.modelId,
      participant.role,
    );

    // Delete participant
    await db.delete(tables.chatParticipant).where(eq(tables.chatParticipant.id, id));

    return Responses.ok(c, {
      deleted: true,
    });
  },
);
