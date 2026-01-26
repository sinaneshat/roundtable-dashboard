/**
 * Project Ownership Verification
 *
 * Composable ownership check with optional includes for attachments, threads, memories.
 * Follows verifyThreadOwnership pattern with overloaded signatures.
 */

import { and, eq } from 'drizzle-orm';

import { ErrorContextBuilders } from '@/common/error-contexts';
import { createError } from '@/common/error-handling';
import type {
  ProjectWithAttachments,
  ProjectWithCounts,
  ProjectWithMemories,
  ProjectWithThreads,
} from '@/common/permissions-schemas';
import type { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { ChatProject } from '@/db/validation/project';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type VerifyProjectOwnershipOptions = {
  includeAttachments?: boolean;
  includeThreads?: boolean;
  includeMemories?: boolean;
};

type RelationConfig = { columns: { id: true } };
type RelationsMap = Record<string, RelationConfig>;

/**
 * Helper to set relation config on object without triggering TS4111 index signature error.
 * ESLint reverts bracket notation, so we use this function to safely set properties.
 */
function setRelation(obj: RelationsMap, key: string, value: RelationConfig): void {
  obj[key] = value;
}

type DbInstance = Awaited<ReturnType<typeof getDbAsync>>;

// ============================================================================
// OVERLOADED FUNCTION SIGNATURES
// ============================================================================

/**
 * Verify project ownership and optionally include related data
 *
 * This function has multiple overloaded signatures:
 * 1. Basic ownership check (returns project only)
 * 2. With attachments (returns project + attachments)
 * 3. With threads (returns project + threads)
 * 4. With counts (returns project + attachments + threads for counting)
 * 5. With memories (returns project + memories)
 *
 * @throws NotFoundError if project doesn't exist or user doesn't own it
 *
 * @example
 * ```ts
 * // Basic ownership check
 * const project = await verifyProjectOwnership(projectId, userId, db);
 *
 * // With attachments
 * const projectWithAttachments = await verifyProjectOwnership(
 *   projectId,
 *   userId,
 *   db,
 *   { includeAttachments: true }
 * );
 *
 * // With counts (for list views)
 * const projectWithCounts = await verifyProjectOwnership(
 *   projectId,
 *   userId,
 *   db,
 *   { includeAttachments: true, includeThreads: true }
 * );
 * ```
 */
export async function verifyProjectOwnership(
  projectId: string,
  userId: string,
  db: DbInstance,
): Promise<ChatProject>;

export async function verifyProjectOwnership(
  projectId: string,
  userId: string,
  db: DbInstance,
  options: { includeAttachments: true; includeThreads?: false; includeMemories?: false },
): Promise<ProjectWithAttachments>;

export async function verifyProjectOwnership(
  projectId: string,
  userId: string,
  db: DbInstance,
  options: { includeThreads: true; includeAttachments?: false; includeMemories?: false },
): Promise<ProjectWithThreads>;

export async function verifyProjectOwnership(
  projectId: string,
  userId: string,
  db: DbInstance,
  options: { includeAttachments: true; includeThreads: true; includeMemories?: false },
): Promise<ProjectWithCounts>;

export async function verifyProjectOwnership(
  projectId: string,
  userId: string,
  db: DbInstance,
  options: { includeMemories: true; includeAttachments?: false; includeThreads?: false },
): Promise<ProjectWithMemories>;

export async function verifyProjectOwnership(
  projectId: string,
  userId: string,
  db: DbInstance,
  options?: VerifyProjectOwnershipOptions,
): Promise<
  | ChatProject
  | ProjectWithAttachments
  | ProjectWithThreads
  | ProjectWithCounts
  | ProjectWithMemories
> {
  const withRelations: RelationsMap = {};

  if (options?.includeAttachments) {
    setRelation(withRelations, 'attachments', { columns: { id: true } });
  }
  if (options?.includeThreads) {
    setRelation(withRelations, 'threads', { columns: { id: true } });
  }
  if (options?.includeMemories) {
    setRelation(withRelations, 'memories', { columns: { id: true } });
  }

  const project = await db.query.chatProject.findFirst({
    where: and(
      eq(tables.chatProject.id, projectId),
      eq(tables.chatProject.userId, userId),
    ),
    with: Object.keys(withRelations).length > 0 ? withRelations : undefined,
  });

  if (!project) {
    throw createError.notFound(
      'Project not found',
      ErrorContextBuilders.resourceNotFound('project', projectId, userId),
    );
  }

  return project;
}
