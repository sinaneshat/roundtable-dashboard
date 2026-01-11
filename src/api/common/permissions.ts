import { eq } from 'drizzle-orm';

import { ErrorContextBuilders } from '@/api/common/error-contexts';
import { createError } from '@/api/common/error-handling';
import type { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { ChatCustomRole, ChatParticipant, ChatProject, ChatThread, ChatUserPreset } from '@/db/validation';

// ============================================================================
// THREAD OWNERSHIP VERIFICATION
// ============================================================================

/**
 * Verify thread ownership and optionally include participants
 *
 * This function has two overloaded signatures:
 * 1. Basic ownership check (returns thread only)
 * 2. Extended check with participants (returns thread + participants)
 *
 * @throws NotFoundError if thread doesn't exist
 * @throws UnauthorizedError if user doesn't own the thread
 * @throws BadRequestError if no enabled participants (when includeParticipants=true)
 *
 * @example
 * ```ts
 * // Basic ownership check
 * const thread = await verifyThreadOwnership(threadId, userId, db);
 *
 * // Check with participants
 * const threadWithParticipants = await verifyThreadOwnership(
 *   threadId,
 *   userId,
 *   db,
 *   { includeParticipants: true }
 * );
 * ```
 */
export async function verifyThreadOwnership(
  threadId: string,
  userId: string,
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<ChatThread>;
export async function verifyThreadOwnership(
  threadId: string,
  userId: string,
  db: Awaited<ReturnType<typeof getDbAsync>>,
  options: { includeParticipants: true },
): Promise<ChatThread & {
  participants: Array<ChatParticipant>;
}>;
export async function verifyThreadOwnership(
  threadId: string,
  userId: string,
  db: Awaited<ReturnType<typeof getDbAsync>>,
  options?: { includeParticipants?: boolean },
): Promise<ChatThread | (ChatThread & { participants: Array<ChatParticipant> })> {
  const thread = await db.query.chatThread.findFirst({
    where: eq(tables.chatThread.id, threadId),
    with: options?.includeParticipants
      ? {
          participants: {
            where: eq(tables.chatParticipant.isEnabled, true),
            orderBy: [tables.chatParticipant.priority, tables.chatParticipant.id],
          },
        }
      : undefined,
  });

  if (!thread) {
    throw createError.notFound('Thread not found', ErrorContextBuilders.resourceNotFound('thread', threadId));
  }

  if (thread.userId !== userId) {
    throw createError.unauthorized(
      'Not authorized to access this thread',
      ErrorContextBuilders.authorization('thread', threadId),
    );
  }

  if (options?.includeParticipants) {
    const threadWithParticipants = thread as typeof thread & {
      participants: Array<ChatParticipant>;
    };
    if (threadWithParticipants.participants.length === 0) {
      throw createError.badRequest(
        'No enabled participants in this thread. Please add or enable at least one AI model to continue the conversation.',
        { errorType: 'validation' },
      );
    }
  }

  return thread;
}

// ============================================================================
// PARTICIPANT OWNERSHIP VERIFICATION
// ============================================================================

/**
 * Verify participant ownership through thread ownership
 *
 * Fetches participant with thread relationship and verifies user owns the thread.
 *
 * @throws NotFoundError if participant doesn't exist
 * @throws UnauthorizedError if user doesn't own the participant's thread
 *
 * @example
 * ```ts
 * const participant = await verifyParticipantOwnership(participantId, userId, db);
 * // Use participant.thread to access thread data
 * ```
 */
export async function verifyParticipantOwnership(
  participantId: string,
  userId: string,
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<ChatParticipant & {
  thread: ChatThread;
}> {
  const participant = await db.query.chatParticipant.findFirst({
    where: eq(tables.chatParticipant.id, participantId),
    with: {
      thread: true,
    },
  });

  if (!participant) {
    throw createError.notFound(
      'Participant not found',
      ErrorContextBuilders.resourceNotFound('participant', participantId),
    );
  }

  if (participant.thread.userId !== userId) {
    throw createError.unauthorized(
      'Not authorized to modify this participant',
      ErrorContextBuilders.authorization('participant', participantId),
    );
  }

  return participant;
}

// ============================================================================
// CUSTOM ROLE OWNERSHIP VERIFICATION
// ============================================================================

/**
 * Verify custom role ownership
 *
 * @throws NotFoundError if custom role doesn't exist
 * @throws UnauthorizedError if user doesn't own the custom role
 *
 * @example
 * ```ts
 * const customRole = await verifyCustomRoleOwnership(roleId, userId, db);
 * ```
 */
export async function verifyCustomRoleOwnership(
  customRoleId: string,
  userId: string,
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<ChatCustomRole> {
  const customRole = await db.query.chatCustomRole.findFirst({
    where: eq(tables.chatCustomRole.id, customRoleId),
  });

  if (!customRole) {
    throw createError.notFound(
      'Custom role not found',
      ErrorContextBuilders.resourceNotFound('custom_role', customRoleId),
    );
  }

  return customRole;
}

// ============================================================================
// USER PRESET OWNERSHIP VERIFICATION
// ============================================================================

/**
 * Verify user preset ownership
 *
 * @throws NotFoundError if user preset doesn't exist
 * @throws UnauthorizedError if user doesn't own the user preset
 *
 * @example
 * ```ts
 * const userPreset = await verifyUserPresetOwnership(presetId, userId, db);
 * ```
 */
export async function verifyUserPresetOwnership(
  userPresetId: string,
  userId: string,
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<ChatUserPreset> {
  const userPreset = await db.query.chatUserPreset.findFirst({
    where: (fields, { and, eq: eqOp }) => and(
      eqOp(fields.id, userPresetId),
      eqOp(fields.userId, userId),
    ),
  });

  if (!userPreset) {
    throw createError.notFound(
      'User preset not found',
      ErrorContextBuilders.resourceNotFound('user_preset', userPresetId),
    );
  }

  return userPreset;
}

// ============================================================================
// PROJECT OWNERSHIP VERIFICATION
// ============================================================================

/**
 * Verify project ownership
 *
 * @throws NotFoundError if project doesn't exist
 * @throws UnauthorizedError if user doesn't own the project
 *
 * @example
 * ```ts
 * const project = await verifyProjectOwnership(projectId, userId, db);
 * ```
 */
export async function verifyProjectOwnership(
  projectId: string,
  userId: string,
  db?: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<ChatProject> {
  // Import getDbAsync here to avoid circular dependency
  const { getDbAsync: getDb } = await import('@/db');
  const database = db || await getDb();

  const project = await database.query.chatProject.findFirst({
    where: (fields, { and, eq: eqOp }) => and(
      eqOp(fields.id, projectId),
      eqOp(fields.userId, userId),
    ),
  });

  if (!project) {
    throw createError.notFound(
      'Project not found',
      ErrorContextBuilders.resourceNotFound('project', projectId),
    );
  }

  return project;
}
