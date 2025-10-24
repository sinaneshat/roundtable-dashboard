/**
 * Participant Handlers - Operations for chat participants (AI models in threads)
 *
 * Following backend-patterns.md: Domain-specific handler module
 * Extracted from monolithic handler.ts for better maintainability
 */

import type { RouteHandler } from '@hono/zod-openapi';
import { and, desc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { executeBatch } from '@/api/common/batch-operations';
import { ErrorContextBuilders } from '@/api/common/error-contexts';
import { createError } from '@/api/common/error-handling';
import { createHandler, createHandlerWithBatch, Responses } from '@/api/core';
import { ChangelogTypes } from '@/api/core/enums';
import { IdParamSchema } from '@/api/core/schemas';
import { extractModeratorModelName, openRouterModelsService } from '@/api/services/openrouter-models.service';
import {
  canAccessModelByPricing,
  getRequiredTierForModel,
  SUBSCRIPTION_TIER_NAMES,
} from '@/api/services/product-logic.service';
import { getMaxModels, getUserTier } from '@/api/services/usage-tracking.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';

import type {
  addParticipantRoute,
  deleteParticipantRoute,
  updateParticipantRoute,
} from '../route';
import {
  AddParticipantRequestSchema,
  UpdateParticipantRequestSchema,
} from '../schema';
import { verifyThreadOwnership } from './helpers';

// ============================================================================
// Participant Handlers
// ============================================================================

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
    // ✅ BATCH PATTERN: Access database through batch.db for atomic operations
    const db = batch.db;

    // Verify thread ownership
    await verifyThreadOwnership(id, user.id, db);

    // Get user's subscription tier to validate model access
    // ✅ DRY: Using centralized getUserTier utility with 5-minute caching
    const userTier = await getUserTier(user.id);

    // ✅ SINGLE SOURCE OF TRUTH: Validate model access using backend service
    const model = await openRouterModelsService.getModelById(body.modelId as string);

    if (!model) {
      throw createError.badRequest(
        `Model "${body.modelId}" not found`,
        {
          errorType: 'validation',
          field: 'modelId',
        },
      );
    }

    // ✅ PRICING-BASED ACCESS: Check using dynamic pricing from OpenRouter
    const canAccess = canAccessModelByPricing(userTier, model);
    if (!canAccess) {
      const requiredTier = getRequiredTierForModel(model);
      throw createError.unauthorized(
        `Your ${SUBSCRIPTION_TIER_NAMES[userTier]} plan does not include access to ${model.name}. Upgrade to ${SUBSCRIPTION_TIER_NAMES[requiredTier]} or higher to use this model.`,
        {
          errorType: 'authorization',
          resource: 'model',
          resourceId: body.modelId as string,
        },
      );
    }

    // Validate maxConcurrentModels limit for user's tier
    // Only count enabled participants for accurate tier limit enforcement
    const existingParticipants = await db.query.chatParticipant.findMany({
      where: and(
        eq(tables.chatParticipant.threadId, id),
        eq(tables.chatParticipant.isEnabled, true),
      ),
    });

    const currentModelCount = existingParticipants.length;

    const maxModels = await getMaxModels(userTier);
    if (currentModelCount >= maxModels) {
      throw createError.badRequest(
        `Your ${SUBSCRIPTION_TIER_NAMES[userTier]} plan allows up to ${maxModels} AI models per conversation. You already have ${currentModelCount} models. Remove a model or upgrade your plan to add more.`,
        {
          errorType: 'validation',
          field: 'modelId',
        },
      );
    }

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
    const nextRoundNumber = (existingUserMessages[0]?.roundNumber || 0) + 1;

    const modelName = extractModeratorModelName(body.modelId as string);
    const changelogId = ulid();
    await db.insert(tables.chatThreadChangelog).values({
      id: changelogId,
      threadId: id,
      roundNumber: nextRoundNumber,
      changeType: 'participant_added',
      changeSummary: `Added ${modelName}${body.role ? ` as "${body.role}"` : ''}`,
      changeData: {
        participantId,
        modelId: body.modelId as string,
        role: body.role as string | null,
      },
      createdAt: now,
    });

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

    // Get participant and verify thread ownership
    const participant = await db.query.chatParticipant.findFirst({
      where: eq(tables.chatParticipant.id, id),
      with: {
        thread: true,
      },
    });

    if (!participant) {
      throw createError.notFound('Participant not found', ErrorContextBuilders.resourceNotFound('participant', id));
    }

    if (participant.thread.userId !== user.id) {
      throw createError.unauthorized('Not authorized to modify this participant', ErrorContextBuilders.authorization('participant', id));
    }

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
      const nextRoundNumber = (existingUserMessages[0]?.roundNumber || 0) + 1;

      const modelName = extractModeratorModelName(participant.modelId);
      const changelogId = ulid();
      await db.insert(tables.chatThreadChangelog).values({
        id: changelogId,
        threadId: participant.threadId,
        roundNumber: nextRoundNumber,
        changeType: ChangelogTypes.PARTICIPANT_UPDATED,
        changeSummary: `Updated ${modelName} role from "${participant.role || 'none'}" to "${body.role || 'none'}"`,
        changeData: {
          participantId: id,
          modelId: participant.modelId,
          oldRole: participant.role,
          newRole: body.role as string | null,
        },
        createdAt: new Date(),
      });
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

    // Get participant and verify thread ownership
    const participant = await db.query.chatParticipant.findFirst({
      where: eq(tables.chatParticipant.id, id),
      with: {
        thread: true,
      },
    });

    if (!participant) {
      throw createError.notFound('Participant not found', ErrorContextBuilders.resourceNotFound('participant', id));
    }

    if (participant.thread.userId !== user.id) {
      throw createError.unauthorized('Not authorized to delete this participant', ErrorContextBuilders.authorization('participant', id));
    }

    // ✅ CALCULATE NEXT ROUND NUMBER for changelog
    const existingUserMessages = await db.query.chatMessage.findMany({
      where: and(
        eq(tables.chatMessage.threadId, participant.threadId),
        eq(tables.chatMessage.role, 'user'),
      ),
      columns: { roundNumber: true },
      orderBy: desc(tables.chatMessage.roundNumber),
      limit: 1,
    });
    const nextRoundNumber = (existingUserMessages[0]?.roundNumber || 0) + 1;

    const modelName = extractModeratorModelName(participant.modelId);
    const changelogId = ulid();

    await executeBatch(db, [
      db.insert(tables.chatThreadChangelog).values({
        id: changelogId,
        threadId: participant.threadId,
        roundNumber: nextRoundNumber,
        changeType: ChangelogTypes.PARTICIPANT_REMOVED,
        changeSummary: `Removed ${modelName}${participant.role ? ` ("${participant.role}")` : ''}`,
        changeData: {
          participantId: id,
          modelId: participant.modelId,
          role: participant.role,
        },
        createdAt: new Date(),
      }),
      db.delete(tables.chatParticipant).where(eq(tables.chatParticipant.id, id)),
    ]);

    return Responses.ok(c, {
      deleted: true,
    });
  },
);
