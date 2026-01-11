import type { RouteHandler } from '@hono/zod-openapi';
import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { ErrorContextBuilders } from '@/api/common/error-contexts';
import { createError } from '@/api/common/error-handling';
import {
  applyCursorPagination,
  buildCursorWhereWithFilters,
  createHandler,
  createTimestampCursor,
  CursorPaginationQuerySchema,
  getCursorOrderBy,
  IdParamSchema,
  Responses,
} from '@/api/core';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { ChatUserPreset } from '@/db/validation/chat';

import type {
  createUserPresetRoute,
  deleteUserPresetRoute,
  getUserPresetRoute,
  listUserPresetsRoute,
  updateUserPresetRoute,
} from '../route';
import {
  CreateUserPresetRequestSchema,
  UpdateUserPresetRequestSchema,
} from '../schema';

export const listUserPresetsHandler: RouteHandler<typeof listUserPresetsRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateQuery: CursorPaginationQuerySchema,
    operationName: 'listUserPresets',
  },
  async (c) => {
    const { user } = c.auth();
    const query = c.validated.query;
    const db = await getDbAsync();
    const userPresets = await db.query.chatUserPreset.findMany({
      where: buildCursorWhereWithFilters(
        tables.chatUserPreset.updatedAt,
        query.cursor,
        'desc',
        [eq(tables.chatUserPreset.userId, user.id)],
      ),
      orderBy: getCursorOrderBy(tables.chatUserPreset.updatedAt, 'desc'),
      limit: query.limit + 1,
    });

    const { items, pagination } = applyCursorPagination(
      userPresets,
      query.limit,
      (preset: ChatUserPreset) => createTimestampCursor(preset.updatedAt),
    );

    return Responses.cursorPaginated(c, items, pagination);
  },
);

export const createUserPresetHandler: RouteHandler<typeof createUserPresetRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: CreateUserPresetRequestSchema,
    operationName: 'createUserPreset',
  },
  async (c) => {
    const { user } = c.auth();
    const body = c.validated.body;
    const db = await getDbAsync();
    const presetId = ulid();
    const now = new Date();

    const [preset] = await db
      .insert(tables.chatUserPreset)
      .values({
        id: presetId,
        userId: user.id,
        name: body.name,
        modelRoles: body.modelRoles,
        mode: body.mode,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return Responses.ok(c, {
      preset,
    });
  },
);

export const getUserPresetHandler: RouteHandler<typeof getUserPresetRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    operationName: 'getUserPreset',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const db = await getDbAsync();

    const preset = await db.query.chatUserPreset.findFirst({
      where: and(
        eq(tables.chatUserPreset.id, id),
        eq(tables.chatUserPreset.userId, user.id),
      ),
    });

    if (!preset) {
      throw createError.notFound('User preset not found', ErrorContextBuilders.resourceNotFound('user_preset', id));
    }

    return Responses.ok(c, {
      preset,
    });
  },
);

export const updateUserPresetHandler: RouteHandler<typeof updateUserPresetRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    validateBody: UpdateUserPresetRequestSchema,
    operationName: 'updateUserPreset',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const body = c.validated.body;
    const db = await getDbAsync();

    const [updatedPreset] = await db
      .update(tables.chatUserPreset)
      .set({
        name: body.name,
        modelRoles: body.modelRoles,
        mode: body.mode,
        updatedAt: new Date(),
      })
      .where(and(
        eq(tables.chatUserPreset.id, id),
        eq(tables.chatUserPreset.userId, user.id),
      ))
      .returning();

    if (!updatedPreset) {
      throw createError.notFound('User preset not found', ErrorContextBuilders.resourceNotFound('user_preset', id));
    }

    return Responses.ok(c, {
      preset: updatedPreset,
    });
  },
);

export const deleteUserPresetHandler: RouteHandler<typeof deleteUserPresetRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    operationName: 'deleteUserPreset',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const db = await getDbAsync();

    const result = await db
      .delete(tables.chatUserPreset)
      .where(and(
        eq(tables.chatUserPreset.id, id),
        eq(tables.chatUserPreset.userId, user.id),
      ))
      .returning();

    if (result.length === 0) {
      throw createError.notFound('User preset not found', ErrorContextBuilders.resourceNotFound('user_preset', id));
    }

    return Responses.ok(c, {
      deleted: true,
    });
  },
);
