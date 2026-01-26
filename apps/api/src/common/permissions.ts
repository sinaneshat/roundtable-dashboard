import { eq } from 'drizzle-orm';

import { ErrorContextBuilders } from '@/common/error-contexts';
import { createError } from '@/common/error-handling';
import type { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { ChatCustomRole, ChatThread } from '@/db/validation';

import type { ParticipantWithThread, ThreadWithParticipants } from './permissions-schemas';

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
): Promise<ThreadWithParticipants>;
export async function verifyThreadOwnership(
  threadId: string,
  userId: string,
  db: Awaited<ReturnType<typeof getDbAsync>>,
  options?: { includeParticipants?: boolean },
): Promise<ChatThread | ThreadWithParticipants> {
  const thread = await db.query.chatThread.findFirst({
    where: eq(tables.chatThread.id, threadId),
    with: options?.includeParticipants
      ? {
          participants: {
            orderBy: [tables.chatParticipant.priority, tables.chatParticipant.id],
            where: eq(tables.chatParticipant.isEnabled, true),
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
    // Type already validated via Drizzle query with `with: { participants: ... }`
    // ThreadWithParticipants schema guarantees participants array exists
    const threadWithParticipants = thread as ThreadWithParticipants;
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
): Promise<ParticipantWithThread> {
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
 *
 * @example
 * ```ts
 * const customRole = await verifyCustomRoleOwnership(roleId, db);
 * ```
 */
export async function verifyCustomRoleOwnership(
  customRoleId: string,
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
