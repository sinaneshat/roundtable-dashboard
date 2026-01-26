import type { RouteHandler } from '@hono/zod-openapi';
import { SubscriptionTiers } from '@roundtable/shared/enums';
import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { ErrorContextBuilders } from '@/common/error-contexts';
import { createError } from '@/common/error-handling';
import { verifyCustomRoleOwnership } from '@/common/permissions';
import {
  applyCursorPagination,
  buildCursorWhereWithFilters,
  createHandler,
  createTimestampCursor,
  CursorPaginationQuerySchema,
  getCursorOrderBy,
  IdParamSchema,
  Responses,
} from '@/core';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { ChatCustomRole } from '@/db/validation';
import {
  deductCreditsForAction,
  enforceCredits,
} from '@/services/billing';
import { getUserTier } from '@/services/usage';
import type { ApiEnv } from '@/types';

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
    operationName: 'listCustomRoles',
    validateQuery: CursorPaginationQuerySchema,
  },
  async (c) => {
    const { user } = c.auth();
    const query = c.validated.query;
    const db = await getDbAsync();
    const customRoles = await db.query.chatCustomRole.findMany({
      limit: query.limit + 1,
      orderBy: getCursorOrderBy(tables.chatCustomRole.updatedAt, 'desc'),
      where: buildCursorWhereWithFilters(
        tables.chatCustomRole.updatedAt,
        query.cursor,
        'desc',
        [eq(tables.chatCustomRole.userId, user.id)],
      ),
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
    operationName: 'createCustomRole',
    validateBody: CreateCustomRoleRequestSchema,
  },
  async (c) => {
    const { user } = c.auth();

    // Parallelize independent validation checks
    const [userTier] = await Promise.all([
      getUserTier(user.id),
      enforceCredits(user.id, 1), // ✅ CREDITS: Enforce credits for custom role creation
    ]);

    // Block free users from creating custom roles
    if (userTier === SubscriptionTiers.FREE) {
      throw createError.unauthorized(
        'Custom roles are not available on the Free plan. Upgrade to create custom roles.',
      );
    }
    // ✅ TYPE-SAFE: createHandler validates body via validateBody config
    const body = c.validated.body;
    const db = await getDbAsync();
    const customRoleId = ulid();
    const now = new Date();
    const [customRole] = await db
      .insert(tables.chatCustomRole)
      .values({
        createdAt: now,
        description: body.description ?? null,
        id: customRoleId,
        metadata: body.metadata ?? null,
        name: body.name,
        systemPrompt: body.systemPrompt,
        updatedAt: now,
        userId: user.id,
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
    operationName: 'getCustomRole',
    validateParams: IdParamSchema,
  },
  async (c) => {
    const { id } = c.validated.params;
    const db = await getDbAsync();
    const customRole = await verifyCustomRoleOwnership(id, db);
    return Responses.ok(c, {
      customRole,
    });
  },
);
export const updateCustomRoleHandler: RouteHandler<typeof updateCustomRoleRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'updateCustomRole',
    validateBody: UpdateCustomRoleRequestSchema,
    validateParams: IdParamSchema,
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
        description: body.description ?? null,
        metadata: body.metadata ?? undefined,
        name: body.name,
        systemPrompt: body.systemPrompt,
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
    operationName: 'deleteCustomRole',
    validateParams: IdParamSchema,
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
