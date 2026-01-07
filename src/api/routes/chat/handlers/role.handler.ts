import type { RouteHandler } from '@hono/zod-openapi';
import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { ErrorContextBuilders } from '@/api/common/error-contexts';
import { createError } from '@/api/common/error-handling';
import { verifyCustomRoleOwnership } from '@/api/common/permissions';
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
import { SubscriptionTiers } from '@/api/core/enums';
import {
  deductCreditsForAction,
  enforceCredits,
} from '@/api/services/billing';
import { getUserTier } from '@/api/services/usage';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { ChatCustomRole } from '@/db/validation';

import type {
  createCustomRoleRoute,
  deleteCustomRoleRoute,
  getCustomRoleRoute,
  listCustomRolesRoute,
  updateCustomRoleRoute,
} from '../route';
import {
  CreateCustomRoleRequestSchema,
  UpdateCustomRoleRequestSchema,
} from '../schema';

export const listCustomRolesHandler: RouteHandler<typeof listCustomRolesRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateQuery: CursorPaginationQuerySchema,
    operationName: 'listCustomRoles',
  },
  async (c) => {
    const { user } = c.auth();
    const query = c.validated.query;
    const db = await getDbAsync();
    const customRoles = await db.query.chatCustomRole.findMany({
      where: buildCursorWhereWithFilters(
        tables.chatCustomRole.updatedAt,
        query.cursor,
        'desc',
        [eq(tables.chatCustomRole.userId, user.id)],
      ),
      orderBy: getCursorOrderBy(tables.chatCustomRole.updatedAt, 'desc'),
      limit: query.limit + 1,
    });
    const { items, pagination } = applyCursorPagination(
      customRoles,
      query.limit,
      (customRole: ChatCustomRole) => createTimestampCursor(customRole.updatedAt),
    );
    return Responses.cursorPaginated(c, items, pagination);
  },
);
export const createCustomRoleHandler: RouteHandler<typeof createCustomRoleRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: CreateCustomRoleRequestSchema,
    operationName: 'createCustomRole',
  },
  async (c) => {
    const { user } = c.auth();

    // Block free users from creating custom roles
    const userTier = await getUserTier(user.id);
    if (userTier === SubscriptionTiers.FREE) {
      throw createError.unauthorized(
        'Custom roles are not available on the Free plan. Upgrade to create custom roles.',
      );
    }

    // ✅ CREDITS: Enforce credits for custom role creation
    await enforceCredits(user.id, 1);
    // ✅ TYPE-SAFE: createHandler validates body via validateBody config
    const body = c.validated.body;
    const db = await getDbAsync();
    const customRoleId = ulid();
    const now = new Date();
    const [customRole] = await db
      .insert(tables.chatCustomRole)
      .values({
        id: customRoleId,
        userId: user.id,
        name: body.name,
        description: body.description ?? null,
        systemPrompt: body.systemPrompt,
        metadata: body.metadata ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    // ✅ CREDITS: Deduct for custom role creation
    await deductCreditsForAction(user.id, 'customRoleCreation');
    return Responses.ok(c, {
      customRole,
    });
  },
);
export const getCustomRoleHandler: RouteHandler<typeof getCustomRoleRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    operationName: 'getCustomRole',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const db = await getDbAsync();
    const customRole = await verifyCustomRoleOwnership(id, user.id, db);
    return Responses.ok(c, {
      customRole,
    });
  },
);
export const updateCustomRoleHandler: RouteHandler<typeof updateCustomRoleRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    validateBody: UpdateCustomRoleRequestSchema,
    operationName: 'updateCustomRole',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    // ✅ TYPE-SAFE: createHandler validates body via validateBody config
    const body = c.validated.body;
    const db = await getDbAsync();
    const [updatedCustomRole] = await db
      .update(tables.chatCustomRole)
      .set({
        name: body.name,
        description: body.description ?? null,
        systemPrompt: body.systemPrompt,
        metadata: body.metadata ?? undefined,
        updatedAt: new Date(),
      })
      .where(and(
        eq(tables.chatCustomRole.id, id),
        eq(tables.chatCustomRole.userId, user.id),
      ))
      .returning();
    if (!updatedCustomRole) {
      throw createError.notFound('Custom role not found', ErrorContextBuilders.resourceNotFound('custom_role', id));
    }
    return Responses.ok(c, {
      customRole: updatedCustomRole,
    });
  },
);
export const deleteCustomRoleHandler: RouteHandler<typeof deleteCustomRoleRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    operationName: 'deleteCustomRole',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const db = await getDbAsync();
    const result = await db
      .delete(tables.chatCustomRole)
      .where(and(
        eq(tables.chatCustomRole.id, id),
        eq(tables.chatCustomRole.userId, user.id),
      ))
      .returning();
    if (result.length === 0) {
      throw createError.notFound('Custom role not found', ErrorContextBuilders.resourceNotFound('custom_role', id));
    }
    return Responses.ok(c, {
      deleted: true,
    });
  },
);
